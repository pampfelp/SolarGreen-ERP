"""Proxy de fotos: Firebase Auth, Gemini, GPT e Claude."""
import base64
import json
import os
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

FIREBASE_API_KEY = os.getenv("FIREBASE_API_KEY", "AIzaSyC50rNjz7cd_1_aWDBMuz84QqOFwPRV1aE")
PROJECT_ID = "solargreen-21313"
ORIGIN = os.getenv("APP_ORIGIN", "https://pampfelp.github.io")
GROUPS = {"Parte CA", "Proteção", "Aterramento", "Parte CC", "Estrutura", "Equipamentos"}
LAST_CALL = {}

def post_json(url, payload, headers=None, timeout=65):
    req = urllib.request.Request(url, data=json.dumps(payload, ensure_ascii=False).encode(),
                                 headers={"Content-Type": "application/json", **(headers or {})}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return json.load(response)

def verify_user(token):
    if not token:
        raise ValueError("Entre no ERP antes de usar a IA.")
    info = post_json("https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=" + FIREBASE_API_KEY,
                     {"idToken": token}, timeout=15)
    users = info.get("users") or []
    if not users or users[0].get("disabled"):
        raise ValueError("Sessão inválida.")
    user = users[0]
    uid = user.get("localId")
    if not uid or not user.get("email"):
        raise ValueError("Sessão inválida.")
    query = {"structuredQuery": {
        "from": [{"collectionId": "vendedores"}],
        "where": {"fieldFilter": {"field": {"fieldPath": "Email"}, "op": "EQUAL",
                                  "value": {"stringValue": user["email"]}}},
        "limit": 1}}
    records = post_json(
        f"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents:runQuery",
        query, {"Authorization": "Bearer " + token}, timeout=15)
    vendor = next((r.get("document", {}).get("fields", {}) for r in records if r.get("document")), None)
    if not vendor or vendor.get("Status", {}).get("stringValue", "Ativo").lower() != "ativo":
        raise ValueError("Seu usuário não está ativo no ERP.")
    if vendor.get("SenhaTemporaria", {}).get("booleanValue"):
        raise ValueError("Troque a senha temporária no ERP.")
    return uid

def clean_photos(photos):
    if not isinstance(photos, list) or not 1 <= len(photos) <= 8:
        raise ValueError("Envie de 1 a 8 fotos.")
    result = []
    for photo in photos:
        if not isinstance(photo, str) or not photo.startswith("data:image/jpeg;base64,"):
            raise ValueError("Formato de foto inválido.")
        data = photo.split(",", 1)[1]
        if len(data) > 1_600_000:
            raise ValueError("Reduza as fotos antes de enviar.")
        base64.b64decode(data, validate=True)
        result.append(data)
    return result

def make_prompt(measures, items):
    base = [{"grupo": i.get("group"), "qtd": i.get("quantity"), "item": i.get("description")}
            for i in items[:100] if isinstance(i, dict)]
    return (
        "Você auxilia a equipe técnica Solar Green na lista de material fotovoltaico. "
        "Analise as fotos junto com as medidas. A lista base já existe. Sugira somente "
        "itens adicionais observáveis nas imagens ou necessários pelo contexto fotografado. "
        "Não repita a lista base. Nunca invente marca, modelo, corrente, tensão, norma ou dimensão. "
        "Quando faltar medida ou manual, use quantidade 'conferir' e explique na observação. "
        "Não conclua seção de cabo, disjuntor, string, DPS nem fixação estrutural sem projeto. "
        "Responda APENAS um objeto JSON com summary e items. Cada item deve ter "
        "group (Parte CA, Proteção, Aterramento, Parte CC, Estrutura ou Equipamentos), "
        "quantity, unit, description e note. "
        f"Medidas: {json.dumps(measures, ensure_ascii=False)[:2500]}. "
        f"Lista base: {json.dumps(base, ensure_ascii=False)[:10000]}."
    )

def parse_answer(text):
    text = text.strip()
    if text.startswith(chr(96) * 3):
        text = text.split("\n", 1)[-1].rsplit(chr(96) * 3, 1)[0].strip()
    result = json.loads(text)
    if not isinstance(result, dict) or not isinstance(result.get("items"), list):
        raise ValueError("Resposta inválida.")
    items = []
    for i in result["items"][:50]:
        if not isinstance(i, dict) or i.get("group") not in GROUPS:
            continue
        description = str(i.get("description", "")).strip()[:200]
        if description:
            items.append({"group": i["group"], "quantity": str(i.get("quantity", "conferir"))[:30],
                          "unit": str(i.get("unit", "un"))[:25], "description": description,
                          "note": str(i.get("note", ""))[:300]})
    return {"summary": str(result.get("summary", ""))[:1500], "items": items}

def gemini(prompt, photos):
    key = os.getenv("GEMINI_API_KEY")
    if not key:
        raise RuntimeError("Sem chave Gemini.")
    payload = {"contents": [{"parts": [{"text": prompt}] + [
        {"inline_data": {"mime_type": "image/jpeg", "data": image}} for image in photos
    ]}], "generationConfig": {"responseMimeType": "application/json"}}
    data = post_json("https://generativelanguage.googleapis.com/v1beta/models/"
                     + os.getenv("GEMINI_MODEL", "gemini-3.8-flash") + ":generateContent",
                     payload, {"x-goog-api-key": key})
    return "".join(p.get("text", "") for p in data["candidates"][0]["content"]["parts"])

def gpt(prompt, photos):
    key = os.getenv("OPENAI_API_KEY")
    if not key:
        raise RuntimeError("Sem chave GPT.")
    payload = {"model": os.getenv("OPENAI_MODEL", "gpt-4.1-mini"), "store": False,
               "input": [{"role": "user", "content": [{"type": "input_text", "text": prompt}] + [
                   {"type": "input_image", "image_url": "data:image/jpeg;base64," + image}
                   for image in photos]}]}
    data = post_json("https://api.openai.com/v1/responses", payload, {"Authorization": "Bearer " + key})
    return "".join(c.get("text", "") for o in data.get("output", [])
                   for c in o.get("content", []) if c.get("type") == "output_text")

def claude(prompt, photos):
    key = os.getenv("ANTHROPIC_API_KEY")
    if not key:
        raise RuntimeError("Sem chave Claude.")
    payload = {"model": os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5-5"), "max_tokens": 3000,
               "messages": [{"role": "user", "content": [{"type": "text", "text": prompt}] + [
                   {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": image}}
                   for image in photos]}]}
    data = post_json("https://api.anthropic.com/v1/messages", payload,
                     {"x-api-key": key, "anthropic-version": "2023-06-01"})
    return "".join(c.get("text", "") for c in data.get("content", []) if c.get("type") == "text")

def analyze_with_fallback(prompt, photos):
    for name, call in [("gemini", gemini), ("gpt", gpt), ("claude", claude)]:
        try:
            return {"provider": name, **parse_answer(call(prompt, photos))}
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError,
                ValueError, KeyError, RuntimeError) as error:
            print(f"{name} indisponível: {type(error).__name__}", flush=True)
    raise RuntimeError("Nenhum provedor respondeu.")

class Handler(BaseHTTPRequestHandler):
    def send_json(self, code, value):
        body = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(code)
        origin = self.headers.get("Origin", "")
        if origin == ORIGIN or origin.startswith("http://localhost:") or origin.startswith("http://127.0.0.1:"):
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
            self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
    def do_OPTIONS(self):
        self.send_json(200 if self.path == "/analyze" else 404, {})
    def do_GET(self):
        if self.path == "/health":
            return self.send_json(200, {"status": "ok", "version": "20261006b",
                "providers": [name for name, env in [("gemini", "GEMINI_API_KEY"),
                ("gpt", "OPENAI_API_KEY"), ("claude", "ANTHROPIC_API_KEY")] if os.getenv(env)]})
        self.send_json(404, {"error": "Rota inexistente."})
    def do_POST(self):
        if self.path != "/analyze":
            return self.send_json(404, {"error": "Rota inexistente."})
        length = int(self.headers.get("Content-Length", "0"))
        if not 0 < length <= 12_000_000:
            return self.send_json(413, {"error": "Fotos grandes demais."})
        try:
            token = self.headers.get("Authorization", "").removeprefix("Bearer ").strip()
            uid = verify_user(token)
            now = time.monotonic()
            if now - LAST_CALL.get(uid, 0) < 30:
                return self.send_json(429, {"error": "Aguarde 30 segundos antes de outra análise."})
            data = json.loads(self.rfile.read(length))
            photos = clean_photos(data.get("photos"))
            measures, items = data.get("measures"), data.get("items")
            if not isinstance(measures, dict) or not isinstance(items, list):
                raise ValueError("Medidas ou lista inválidas.")
            LAST_CALL[uid] = now
            prompt = make_prompt(measures, items)
            answer = analyze_with_fallback(prompt, photos)
            self.send_json(200, answer)
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json(400, {"error": str(error)})
        except urllib.error.HTTPError:
            self.send_json(401, {"error": "Sessão inválida ou sem acesso ao ERP."})
        except Exception as error:
            print(f"Erro na análise: {type(error).__name__}", flush=True)
            self.send_json(503, {"error": "Serviço temporariamente indisponível."})

if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", int(os.getenv("PORT", "10000"))), Handler).serve_forever()
