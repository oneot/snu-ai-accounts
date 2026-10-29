const b64 = text => Uint8Array.from(atob(text), char => char.charCodeAt(0));
const hex = bytes => [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");

let loading;
function load() {
  if (!loading) {
    loading = fetch("./data.json", { cache: "no-cache" })
      .then(response => {
        if (!response.ok) throw new Error("data.json " + response.status);
        return response.json();
      })
      .catch(error => {
        loading = null;
        throw error;
      });
  }
  return loading;
}
load().catch(() => {});

// 이름에서 레코드 ID와 복호화 키를 함께 유도한다. 일치하는 레코드가 없으면 null.
export async function lookup(input) {
  const name = input.normalize("NFC").replace(/\s/g, "");
  if (!name) return null;
  const data = await load();
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(name), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: b64(data.salt), iterations: data.it, hash: "SHA-256" }, key, 512));
  const record = data.e[hex(bits.slice(0, 32))];
  if (!record) return null;
  const aes = await crypto.subtle.importKey("raw", bits.slice(32), "AES-GCM", false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(record[0]) }, aes, b64(record[1]));
  return JSON.parse(new TextDecoder().decode(plain));
}
