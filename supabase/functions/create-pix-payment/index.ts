import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUBSCRIPTION_PRICE = 349.00;
const ASAAS_BASE = Deno.env.get("ASAAS_BASE_URL") ?? "https://api-sandbox.asaas.com/v3";

const onlyDigits = (s: unknown) => String(s ?? "").replace(/\D/g, "");
async function asaas(path: string, method: string, apiKey: string, body?: unknown) {
  const r = await fetch(`${ASAAS_BASE}${path}`, {
    method,
    headers: { access_token: apiKey, "Content-Type": "application/json", "User-Agent": "primeiropasso/1.0" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const { kind, reference_id, provider = "manual", cpfCnpj, name, phone } = await req.json();
    if (!kind || !["subscription_renewal", "credit_pack"].includes(kind)) {
      return new Response(JSON.stringify({ error: "kind inválido" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: pro } = await admin
      .from("professionals")
      .select("id, asaas_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!pro) {
      return new Response(JSON.stringify({ error: "Profissional não encontrado" }), {
        status: 404, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Determina valor
    let amount = 0;
    let actualRef = reference_id;
    if (kind === "subscription_renewal") {
      amount = SUBSCRIPTION_PRICE;
      actualRef = "subscription";
    } else {
      const { data: pack } = await admin
        .from("credit_packs")
        .select("*")
        .eq("id", reference_id)
        .eq("active", true)
        .maybeSingle();
      if (!pack) {
        return new Response(JSON.stringify({ error: "Pacote não encontrado" }), {
          status: 404, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      amount = pack.price_brl;
    }

    // ── Caminho Asaas: cobrança avulsa (PIX/cartão/boleto na página do Asaas) ──────────
    // Usado para compra de créditos. Assinatura recorrente vai pela edge asaas-subscribe.
    if (provider === "asaas") {
      const apiKey = Deno.env.get("ASAAS_API_KEY");
      if (!apiKey) {
        return new Response(JSON.stringify({ error: "ASAAS_API_KEY não configurada" }), {
          status: 500, headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      if (kind === "subscription_renewal") {
        return new Response(JSON.stringify({ error: "Assinatura recorrente usa a edge asaas-subscribe" }), {
          status: 400, headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      // Garante o customer (reusa entre assinatura e compras de crédito)
      let customerId = pro.asaas_customer_id as string | null;
      if (!customerId) {
        const cpf = onlyDigits(cpfCnpj);
        if (!cpf) {
          return new Response(JSON.stringify({ error: "Informe o CPF/CNPJ para a primeira compra" }), {
            status: 400, headers: { ...cors, "Content-Type": "application/json" },
          });
        }
        const { data: profile } = await admin.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle();
        const cust = await asaas("/customers", "POST", apiKey, {
          name: profile?.full_name || name || "Profissional",
          cpfCnpj: cpf,
          email: user.email,
          mobilePhone: phone ? onlyDigits(phone) : undefined,
        });
        if (!cust.ok || !cust.data?.id) {
          return new Response(JSON.stringify({ error: cust.data?.errors?.[0]?.description ?? "Erro ao registrar o cliente", asaas: cust.data }), {
            status: 400, headers: { ...cors, "Content-Type": "application/json" },
          });
        }
        customerId = cust.data.id;
        await admin.from("professionals").update({ asaas_customer_id: customerId }).eq("id", pro.id);
      }

      // Cria o registro local (pending) e a cobrança no Asaas, casadas por externalReference.
      const { data: payment, error: insertErr } = await admin
        .from("pix_payments")
        .insert({
          professional_id: pro.id,
          kind,
          reference_id: actualRef,
          amount_brl: amount,
          provider: "asaas",
          status: "pending",
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        })
        .select("*")
        .single();
      if (insertErr) throw insertErr;

      const origin = req.headers.get("origin") || Deno.env.get("PUBLIC_SITE_URL") || "";
      const today = new Date().toISOString().slice(0, 10);
      const pay = await asaas("/payments", "POST", apiKey, {
        customer: customerId,
        billingType: "UNDEFINED", // cliente escolhe PIX/cartão/boleto na página do Asaas
        value: amount,
        dueDate: today,
        description: "Recarga de créditos — Primeiro Passo",
        externalReference: payment.id,
        ...(origin ? { callback: { successUrl: `${origin}/admin/assinatura`, autoRedirect: true } } : {}),
      });
      if (!pay.ok || !pay.data?.id) {
        await admin.from("pix_payments").update({ status: "cancelled" }).eq("id", payment.id);
        return new Response(JSON.stringify({ error: pay.data?.errors?.[0]?.description ?? "Erro ao criar cobrança", asaas: pay.data }), {
          status: 400, headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      await admin.from("pix_payments")
        .update({ asaas_payment_id: pay.data.id, asaas_invoice_url: pay.data.invoiceUrl })
        .eq("id", payment.id);

      return new Response(JSON.stringify({
        provider: "asaas",
        payment_id: payment.id,
        amount_brl: amount,
        kind,
        invoiceUrl: pay.data.invoiceUrl,
        expires_at: payment.expires_at,
      }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    // ── Caminho manual (fallback): PIX estático + comprovante + aprovação manual ───────
    const { data: payment, error: insertErr } = await admin
      .from("pix_payments")
      .insert({
        professional_id: pro.id,
        kind,
        reference_id: actualRef,
        amount_brl: amount,
        status: "awaiting_proof",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select("*")
      .single();
    if (insertErr) throw insertErr;

    // Busca settings PIX
    const { data: pixSettings } = await admin
      .from("pix_settings")
      .select("*")
      .eq("id", "main")
      .maybeSingle();

    return new Response(JSON.stringify({
      provider: "manual",
      payment_id: payment.id,
      amount_brl: payment.amount_brl,
      kind: payment.kind,
      expires_at: payment.expires_at,
      pix: pixSettings,
    }), { headers: { ...cors, "Content-Type": "application/json" } });

  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
