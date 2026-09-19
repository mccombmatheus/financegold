#!/usr/bin/env python3
"""
Aponta o app para um servidor novo (o endereço /exec de uma implantação nova).

    python3 apps-script/trocar-gateway.py https://script.google.com/macros/s/.../exec

Faz, nesta ordem: confere o endereço com verificar-servidor.py; só se tudo estiver
certo troca GATEWAY_URL em js/config.js e aumenta o número de CACHE_NAME em sw.js.
Depois você faz Commit + Push no GitHub Desktop. O endereço antigo fica impresso
na tela: guarde-o, ele é o "desfazer" (rode este script de novo com ele).
"""
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util  # noqa: E402

spec = importlib.util.spec_from_file_location("verificar_servidor", os.path.join(os.path.dirname(os.path.abspath(__file__)), "verificar-servidor.py"))
vs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vs)

if len(sys.argv) < 2 or sys.argv[1].startswith("--"):
    print("Informe o endereço novo. Exemplo: python3 apps-script/trocar-gateway.py https://script.google.com/macros/s/AKfy.../exec")
    sys.exit(1)
novo = sys.argv[1].strip()
antigo = vs.ler_config_url()

print(f"\nEndereço atual : {antigo}\nEndereço novo  : {novo}\n")
if novo == antigo:
    print("O app já aponta para esse endereço. Nada a fazer.")
    sys.exit(0)

res = vs.verificar(novo)
if any(not r[0] for r in res):
    print("\nO servidor novo não passou nas verificações. NADA foi alterado.")
    sys.exit(1)

cfg = os.path.join(RAIZ, "js/config.js")
with open(cfg, encoding="utf-8") as f:
    texto = f.read()
novo_texto = re.sub(r'GATEWAY_URL:\s*"[^"]*"', lambda _m: f'GATEWAY_URL: "{novo}"', texto, count=1)
with open(cfg, "w", encoding="utf-8") as f:
    f.write(novo_texto)

sw = os.path.join(RAIZ, "sw.js")
with open(sw, encoding="utf-8") as f:
    s = f.read()
s2 = re.sub(r'(-shell-v)(\d+)', lambda m: f"{m.group(1)}{int(m.group(2)) + 1}", s, count=1)
with open(sw, "w", encoding="utf-8") as f:
    f.write(s2)

print(f"""
Pronto: js/config.js agora aponta para o servidor novo e o cache do app foi renovado.

Próximo passo: no GitHub Desktop, confira js/config.js e sw.js, escreva "Novo servidor" no
Summary, clique em Commit to main e depois em Push origin.

Para DESFAZER (se algo der errado): rode
  python3 apps-script/trocar-gateway.py {antigo}
e publique de novo.
""")
