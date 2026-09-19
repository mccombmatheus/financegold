#!/usr/bin/env python3
"""
Verifica se um servidor do app (o endereço terminado em /exec) está no ar e
seguro, SEM precisar de login. Serve para conferir uma implantação nova antes de
apontar o app para ela e para conferir a migração de conta.

    python3 apps-script/verificar-servidor.py                 (usa o GATEWAY_URL de js/config.js)
    python3 apps-script/verificar-servidor.py https://script.google.com/macros/s/.../exec

O que confere:
  1. o endereço responde e mostra a versão do servidor (e se é a do Code.gs deste projeto);
  2. um pedido com token inválido é recusado com 401;
  3. um corpo que não é JSON é recusado com 400;
  4. ler dados sem token é recusado;
  5. o navegador do site consegue falar com ele (cabeçalho CORS).
Não confere login real, e-mail, nem dados: isso só a pessoa consegue testar entrando no app.
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def origem_do_site():
    with open(os.path.join(RAIZ, "apps-script/Code.gs"), encoding="utf-8") as f:
        m = re.search(r'APP_URL:\s*"(https?://[^/"]+)', f.read())
    return m.group(1) if m else "https://example.github.io"


ORIGEM_SITE = origem_do_site()


def ler_config_url():
    with open(os.path.join(RAIZ, "js/config.js"), encoding="utf-8") as f:
        m = re.search(r'GATEWAY_URL:\s*"([^"]*)"', f.read())
    return m.group(1) if m else ""


def versao_esperada():
    with open(os.path.join(RAIZ, "apps-script/Code.gs"), encoding="utf-8") as f:
        m = re.search(r'GATEWAY_VERSION\s*=\s*"([^"]+)"', f.read())
    return m.group(1) if m else None


def chamar(url, corpo=None):
    """Usa o curl do sistema (sempre presente no Mac e com os certificados certos);
    se não houver curl, cai para o urllib do Python."""
    import shutil
    import subprocess
    import tempfile

    if shutil.which("curl"):
        with tempfile.NamedTemporaryFile(delete=False) as hf, tempfile.NamedTemporaryFile(delete=False) as bf:
            hpath, bpath = hf.name, bf.name
        cmd = ["curl", "-sL", "--max-time", "60", "-H", "Content-Type: text/plain;charset=utf-8",
               "-H", f"Origin: {ORIGEM_SITE}", "-D", hpath, "-o", bpath]
        if corpo is not None:
            cmd += ["--data-binary", corpo]  # curl troca para GET no redirecionamento, como o navegador
        cmd.append(url)
        try:
            subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            with open(hpath, encoding="utf-8", errors="replace") as f:
                blocos = [b for b in f.read().replace("\r\n", "\n").split("\n\n") if b.strip()]
            ultimo = blocos[-1].split("\n") if blocos else []
            status = int(ultimo[0].split()[1]) if ultimo and ultimo[0].startswith("HTTP") else 0
            headers = {}
            for linha in ultimo[1:]:
                if ":" in linha:
                    k, v = linha.split(":", 1)
                    headers[k.strip().lower()] = v.strip()
            with open(bpath, encoding="utf-8", errors="replace") as f:
                return status, headers, f.read()
        finally:
            for t in (hpath, bpath):
                if os.path.exists(t):
                    os.remove(t)

    req = urllib.request.Request(
        url,
        data=None if corpo is None else corpo.encode("utf-8"),
        headers={"Content-Type": "text/plain;charset=utf-8", "Origin": ORIGEM_SITE},
        method="GET" if corpo is None else "POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, {k.lower(): v for k, v in r.headers.items()}, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}, e.read().decode("utf-8", "replace")


def como_json(texto):
    try:
        return json.loads(texto)
    except Exception:  # noqa: BLE001
        return None


def verificar(url, imprimir=True):
    resultados = []

    def check(nome, ok, detalhe=""):
        resultados.append((ok, nome, detalhe))
        if imprimir:
            print(("  [OK]    " if ok else "  [FALHA] ") + nome + (f"  ({detalhe})" if detalhe and not ok else ""))

    if not re.fullmatch(r"https://script\.google\.com/macros/s/[A-Za-z0-9_\-]+/exec", url or ""):
        check("o endereço tem o formato de um servidor do Apps Script (.../exec)", False, url or "vazio")
        return resultados

    try:
        st, _, corpo = chamar(url)
        check("o endereço responde", st == 200 and "gateway ativo" in corpo, f"HTTP {st}: {corpo[:80]}")
        esperada = versao_esperada()
        m = re.search(r"Versão (\S+)", corpo)
        versao = m.group(1) if m else None
        if esperada:
            check(f"a versão publicada é a deste projeto ({esperada})", versao == esperada, f"o servidor diz: {versao or 'nenhuma (código antigo)'}")

        st, h, corpo = chamar(url, json.dumps({"action": "me", "token": "invalido"}))
        j = como_json(corpo)
        check("token inválido é recusado (401)", bool(j) and j.get("ok") is False and j.get("status") == 401, corpo[:80])
        check("o navegador do site pode falar com ele (CORS)", h.get("access-control-allow-origin") in ("*", ORIGEM_SITE), str(h.get("access-control-allow-origin")))

        st, _, corpo = chamar(url, "isto-nao-e-json")
        j = como_json(corpo)
        check("corpo que não é JSON é recusado (400)", bool(j) and j.get("ok") is False and j.get("status") == 400, corpo[:80])

        st, _, corpo = chamar(url, json.dumps({"action": "getValues", "spreadsheetId": "x", "range": "Estoque!A2:P"}))
        j = como_json(corpo)
        check("ler dados sem token é recusado", bool(j) and j.get("ok") is False and j.get("status") in (401, 403), corpo[:80])

        st, _, corpo = chamar(url, json.dumps({"action": "createCompany", "token": "invalido", "nome": "x"}))
        j = como_json(corpo)
        check("criar empresa sem ser administrador é recusado", bool(j) and j.get("ok") is False and j.get("status") in (401, 403), corpo[:80])
    except Exception as e:  # noqa: BLE001
        check("consegui falar com o servidor", False, str(e))
    return resultados


if __name__ == "__main__":
    alvo = sys.argv[1] if len(sys.argv) > 1 else ler_config_url()
    print(f"\nVerificando: {alvo}\n")
    res = verificar(alvo)
    falhas = [r for r in res if not r[0]]
    print("\n" + ("TUDO CERTO." if not falhas else f"{len(falhas)} verificação(ões) falharam."))
    sys.exit(1 if falhas else 0)
