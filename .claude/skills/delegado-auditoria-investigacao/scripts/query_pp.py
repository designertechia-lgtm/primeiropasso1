"""Roda SQL no projeto Primeiro Passo (pp) via Supabase Management API e salva JSON.

Portátil: funciona LOCAL e REMOTO (claude.ai/code). NUNCA contém segredo.
Credenciais vêm de variáveis de ambiente:
    SUPABASE_PP_REF    = ref do projeto (ex.: lpqkkbtadnqkbathdvzb)
    SUPABASE_PP_TOKEN  = Management API token (sbp_...)

Fallback local: se as env vars não existirem, tenta ler c:/tmp/.supabase-projects.json
(chave "pp"), pra continuar funcionando na máquina do Carlos sem configurar nada.

Uso:
    python query_pp.py <sql_path> <out_json_path>
    # ou SQL inline:
    python query_pp.py -c "select count(*) from chat_messages" out.json
"""
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path


def load_creds():
    ref = os.environ.get("SUPABASE_PP_REF")
    token = os.environ.get("SUPABASE_PP_TOKEN")
    if ref and token:
        return ref, token
    # fallback local (máquina do Carlos)
    for candidate in (Path(r"c:\tmp\.supabase-projects.json"), Path.home() / ".supabase-projects.json"):
        if candidate.exists():
            cfg = json.loads(candidate.read_text(encoding="utf-8")).get("pp", {})
            if cfg.get("ref") and cfg.get("token"):
                return cfg["ref"], cfg["token"]
    raise SystemExit(
        "Sem credenciais. Defina SUPABASE_PP_REF e SUPABASE_PP_TOKEN como variáveis de ambiente "
        "(ou tenha c:/tmp/.supabase-projects.json local)."
    )


def main():
    if len(sys.argv) < 3:
        raise SystemExit("Uso: python query_pp.py [<sql_path> | -c \"SQL\"] <out_json_path>")
    if sys.argv[1] == "-c":
        sql = sys.argv[2]
        out_path = sys.argv[3]
    else:
        sql = Path(sys.argv[1]).read_text(encoding="utf-8")
        out_path = sys.argv[2]

    ref, token = load_creds()
    body = json.dumps({"query": sql}, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{ref}/database/query",
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json; charset=utf-8",
            "User-Agent": "curl/8.5.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = resp.read().decode("utf-8")
            Path(out_path).write_text(data, encoding="utf-8")
            print(f"HTTP {resp.status} - saved to {out_path} ({len(data)} bytes)")
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8")
        Path(out_path).write_text(err, encoding="utf-8")
        print(f"HTTP {e.code} ERROR - saved to {out_path}")
        sys.exit(1)


if __name__ == "__main__":
    main()
