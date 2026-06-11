import type { Campaign, Asset } from "./types";

// Formato de importação do Google Ads Editor: uma linha por entidade,
// colunas compartilhadas identificam campanha/grupo. Campos vazios são ignorados.
const HEADERS = [
  "Campaign",
  "Campaign Daily Budget",
  "Campaign Type",
  "Networks",
  "Ad Group",
  "Keyword",
  "Criterion Type",
  "Ad Type",
  "Final URL",
  ...Array.from({ length: 15 }, (_, i) => `Headline ${i + 1}`),
  ...Array.from({ length: 4 }, (_, i) => `Description ${i + 1}`),
  "Path 1",
  "Path 2",
  "Status",
] as const;

type Row = Partial<Record<(typeof HEADERS)[number], string>>;

const MATCH_TYPE_LABEL: Record<string, string> = {
  broad: "Broad",
  phrase: "Phrase",
  exact: "Exact",
};

function csvField(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function rowToLine(row: Row): string {
  return HEADERS.map((h) => csvField(row[h] ?? "")).join(",");
}

export function buildGoogleAdsEditorCsv(campaign: Campaign, assets: Asset[]): string {
  const rows: Row[] = [];
  const campaignName = campaign.name;

  // 1. Campanha — exportada PAUSADA de propósito: o profissional confere
  //    orçamento/segmentação no Editor e ativa manualmente. Nada gasta por acidente.
  rows.push({
    Campaign: campaignName,
    "Campaign Daily Budget": Number(campaign.daily_budget_brl).toFixed(2),
    "Campaign Type": "Search",
    Networks: "Google search",
    Status: "Paused",
  });

  const adGroups = assets
    .filter((a) => a.asset_type === "ad_group")
    .sort((a, b) => a.position - b.position);

  for (const group of adGroups) {
    const groupName: string = group.payload.name ?? "Grupo";

    // 2. Grupo de anúncios
    rows.push({
      Campaign: campaignName,
      "Ad Group": groupName,
      Status: "Enabled",
    });

    // 3. RSA do grupo
    const rsa = assets.find((a) => a.asset_type === "rsa" && a.parent_id === group.id);
    if (rsa) {
      const row: Row = {
        Campaign: campaignName,
        "Ad Group": groupName,
        "Ad Type": "Responsive search ad",
        "Final URL": rsa.payload.final_url ?? campaign.landing_url ?? "",
        "Path 1": rsa.payload.path1 ?? "",
        "Path 2": rsa.payload.path2 ?? "",
        Status: "Enabled",
      };
      (rsa.payload.headlines ?? []).slice(0, 15).forEach((h: string, i: number) => {
        row[`Headline ${i + 1}` as (typeof HEADERS)[number]] = h;
      });
      (rsa.payload.descriptions ?? []).slice(0, 4).forEach((d: string, i: number) => {
        row[`Description ${i + 1}` as (typeof HEADERS)[number]] = d;
      });
      rows.push(row);
    }

    // 4. Keywords do grupo
    const keywords = assets
      .filter((a) => a.asset_type === "keyword" && a.parent_id === group.id)
      .sort((a, b) => a.position - b.position);
    for (const kw of keywords) {
      rows.push({
        Campaign: campaignName,
        "Ad Group": groupName,
        Keyword: kw.payload.text ?? "",
        "Criterion Type": MATCH_TYPE_LABEL[kw.payload.match_type] ?? "Broad",
        Status: "Enabled",
      });
    }

    // 5. Negativos do grupo (Phrase: bloqueia a sequência — certo p/ "o que é" etc.)
    const groupNegs = assets.filter(
      (a) => a.asset_type === "negative_keyword" && a.parent_id === group.id,
    );
    for (const neg of groupNegs) {
      rows.push({
        Campaign: campaignName,
        "Ad Group": groupName,
        Keyword: neg.payload.text ?? "",
        "Criterion Type": "Negative Phrase",
      });
    }
  }

  // 6. Negativos de campanha (sem Ad Group)
  const campaignNegs = assets.filter(
    (a) => a.asset_type === "negative_keyword" && !a.parent_id,
  );
  for (const neg of campaignNegs) {
    rows.push({
      Campaign: campaignName,
      Keyword: neg.payload.text ?? "",
      "Criterion Type": "Negative Phrase",
    });
  }

  return [HEADERS.join(","), ...rows.map(rowToLine)].join("\r\n");
}

export function downloadGoogleAdsEditorCsv(campaign: Campaign, assets: Asset[]) {
  const csv = buildGoogleAdsEditorCsv(campaign, assets);
  // BOM UTF-8: Editor/Excel no Windows lê acentos corretamente
  const blob = new Blob([String.fromCharCode(0xfeff) + csv], { type: "text/csv;charset=utf-8" });
  const slug = campaign.name
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `google-ads-${slug || "campanha"}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
