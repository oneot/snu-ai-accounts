import { lookup } from "./lookup.js";

const HINT = "이름을 입력하세요";
const $ = id => document.getElementById(id);
const box = $("box");
const field = $("field");
const input = $("input");
const send = $("send");
const live = $("live");
const motion = matchMedia("(prefers-reduced-motion: reduce)");
const play = (element, frames, options) => motion.matches ? null : element.animate(frames, options);

let busy = false;
let generation = 0;
let hintTimer;
let inputAnimation;
const copyTimers = new Map();

function setBusy(value) {
  busy = value;
  input.readOnly = value;
  send.disabled = value || !input.value.trim() || box.classList.contains("done");
  box.setAttribute("aria-busy", String(value));
}

function hint(text, isError = false, quiet = false) {
  const old = field.querySelector(".ph:last-child");
  const next = Object.assign(document.createElement("span"), {
    className: "ph" + (isError ? " error" : ""), textContent: text
  });
  next.setAttribute("aria-hidden", "true");
  field.append(next);
  input.setAttribute("aria-label", text);
  live.textContent = text;
  if (old && quiet) old.remove();
  const out = old && !quiet && play(old, [
    { opacity: 1, transform: "translateY(-50%)", filter: "blur(0)" },
    { opacity: 0, transform: "translateY(-120%)", filter: "blur(6px)" }
  ], { duration: 320, easing: "cubic-bezier(.4, 0, 1, 1)", fill: "forwards" });
  if (out) out.onfinish = () => old.remove();
  else if (old?.isConnected) old.remove();
  play(next, [
    { opacity: 0, transform: "translateY(20%)", filter: "blur(6px)" },
    { opacity: 1, transform: "translateY(-50%)", filter: "blur(0)" }
  ], { duration: 620, delay: 90, easing: "cubic-bezier(.2, 1.25, .3, 1)", fill: "backwards" });
}

async function clearTyped(current) {
  const animation = input.value && play(input, [
    { opacity: 1, transform: "none", filter: "blur(0)" },
    { opacity: 0, transform: "translateY(-12px)", filter: "blur(5px)" }
  ], { duration: 260, easing: "ease-in", fill: "forwards" });
  inputAnimation = animation;
  if (animation) await animation.finished;
  if (current !== generation) return;
  input.value = "";
  field.classList.remove("filled");
  send.disabled = true;
  if (animation) animation.cancel();
  inputAnimation = null;
}

const jelly = () => play(box, [
  { transform: "scale(1)" }, { transform: "scale(1.02, .95)" },
  { transform: "scale(.994, 1.014)" }, { transform: "scale(1)" }
], { duration: 600, easing: "ease-out", composite: "add" });

const shake = () => play(box, [
  { transform: "translateX(0)" }, { transform: "translateX(-10px)" },
  { transform: "translateX(8px)" }, { transform: "translateX(-5px)" },
  { transform: "translateX(3px)" }, { transform: "translateX(0)" }
], { duration: 480, easing: "ease-out", composite: "add" });

function morph(change) {
  const before = box.getBoundingClientRect().height;
  const beforeRadius = getComputedStyle(box).borderRadius;
  change();
  const after = box.getBoundingClientRect().height;
  const afterRadius = getComputedStyle(box).borderRadius;
  play(box, [
    { height: before + "px", borderRadius: beforeRadius },
    { height: after + "px", borderRadius: afterRadius }
  ], { duration: 780, easing: "cubic-bezier(.2, 1.12, .3, 1)" });
}

function fail(message, ms = 2600) {
  shake();
  input.value = "";
  input.setAttribute("aria-invalid", "true");
  field.classList.remove("filled");
  send.disabled = true;
  hint(message, true, true);
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => hint(HINT), ms);
}

// 좁은 화면에서 아이디가 '@' 뒤에서 줄바꿈되도록 한다. textContent(복사 값)는 그대로다.
function setId(element, id) {
  const at = id.indexOf("@") + 1;
  element.replaceChildren(id.slice(0, at), document.createElement("wbr"), id.slice(at));
}

function show({ name, id, pw }) {
  $("who").textContent = name;
  setId($("uid"), id);
  $("pw").textContent = pw;
  morph(() => box.classList.add("done"));
  box.querySelectorAll(".bar > *, .row, .note").forEach((element, i) => play(element, [
    { opacity: 0, transform: "translateY(10px)", filter: "blur(6px)" },
    { opacity: 1, transform: "none", filter: "blur(0)" }
  ], { duration: 640, delay: 160 + i * 90, easing: "cubic-bezier(.2, 1, .3, 1)", fill: "backwards" }));
  box.querySelector(".copy").focus({ preventScroll: true });
  live.textContent = "계정을 찾았어요. 아이디와 비밀번호를 복사할 수 있어요.";
}

function resetCopy(button) {
  clearTimeout(copyTimers.get(button));
  copyTimers.delete(button);
  button.classList.remove("ok", "error");
  button.setAttribute("aria-label", button.dataset.label + " 복사");
  button.removeAttribute("title");
}

function restart() {
  // 진행 중인 조회·복사 결과가 새 입력을 덮어쓰지 않도록 무효화한다.
  generation++;
  clearTimeout(hintTimer);
  if (inputAnimation) inputAnimation.cancel();
  inputAnimation = null;
  box.querySelectorAll(".copy").forEach(resetCopy);
  input.value = "";
  input.removeAttribute("aria-invalid");
  field.classList.remove("filled");
  if (box.classList.contains("done")) morph(() => box.classList.remove("done"));
  ["who", "uid", "pw"].forEach(id => { $(id).textContent = ""; });
  setBusy(false);
  hint(HINT, false, true);
  input.focus();
}

async function submit() {
  const value = input.value.trim();
  if (busy || !value || box.classList.contains("done")) return;
  const current = generation;
  clearTimeout(hintTimer);
  setBusy(true);
  try {
    const found = await lookup(value);
    if (current !== generation) return;
    if (!found) {
      fail("명단에서 찾을 수 없어요");
      return;
    }
    jelly();
    await clearTyped(current);
    if (current !== generation) return;
    show(found);
  } catch {
    if (current !== generation) return;
    fail(globalThis.crypto?.subtle
      ? "불러오지 못했어요. 새로고침 후 다시 해 보세요"
      : "HTTPS 또는 localhost에서 열어 주세요", 3600);
  } finally {
    if (current === generation) {
      setBusy(false);
      if (!box.classList.contains("done")) input.focus();
    }
  }
}

function legacyCopy(text) {
  const active = document.activeElement;
  const textarea = Object.assign(document.createElement("textarea"), {
    value: text, readOnly: true, tabIndex: -1
  });
  textarea.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;font-size:16px";
  document.body.append(textarea);
  try {
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    return document.execCommand("copy") === true;
  } catch {
    return false;
  } finally {
    textarea.remove();
    active?.focus({ preventScroll: true });
  }
}

async function copy(button) {
  const target = $(button.dataset.copy);
  const text = target.textContent;
  if (!text) return;
  const current = generation;
  resetCopy(button);
  let copied = false;
  try {
    await navigator.clipboard.writeText(text);
    copied = true;
  } catch {
    copied = legacyCopy(text);
  }
  if (current !== generation) return;
  if (copied) {
    button.classList.add("ok");
    button.setAttribute("aria-label", button.dataset.label + " 복사됨");
    live.textContent = button.dataset.label + "를 복사했어요.";
    jelly();
    copyTimers.set(button, setTimeout(() => resetCopy(button), 1800));
  } else {
    const message = "자동 복사에 실패했어요. 직접 선택해 복사해 주세요.";
    button.classList.add("error");
    button.title = message;
    live.textContent = message;
    const selection = getSelection();
    if (selection) {
      const range = document.createRange();
      range.selectNodeContents(target);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    copyTimers.set(button, setTimeout(() => resetCopy(button), 3600));
  }
}

input.addEventListener("input", () => {
  field.classList.toggle("filled", input.value.length > 0);
  send.disabled = busy || !input.value.trim();
  if (input.hasAttribute("aria-invalid")) {
    input.removeAttribute("aria-invalid");
    clearTimeout(hintTimer);
    hint(HINT, false, true);
  }
});
// 한글 조합 중 Enter(조합 확정)는 제출로 취급하지 않는다.
input.addEventListener("keydown", event => {
  if (event.key === "Enter" && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault();
    submit();
  }
});
send.addEventListener("click", submit);
$("again").addEventListener("click", restart);
box.querySelectorAll(".copy").forEach(button => button.addEventListener("click", () => copy(button)));
box.addEventListener("click", event => {
  if (!box.classList.contains("done") && !event.target.closest("button")) input.focus();
});
box.addEventListener("pointermove", event => {
  const rect = box.getBoundingClientRect();
  box.style.setProperty("--x", event.clientX - rect.left + "px");
  box.style.setProperty("--y", event.clientY - rect.top + "px");
});
