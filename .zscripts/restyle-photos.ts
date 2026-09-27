/**
 * Task 27-c: перестилизовать public/img/p/*.jpg (132 шт) из постановочного
 * «киношного» вида в живые любительские фото б/у товара для объявления (Авито-стиль).
 *
 * Для каждого файла: image-edit (z-ai gateway) → /tmp/restyle/<name>.png → jpg q88 →
 * postfx.py (зерно/плоский грейд/микро-поворот — «любительскость») →
 * атомарная замена public/img/p/<name>.jpg (tmp в той же папке + renameSync).
 * Конкурентность ровно 3, 1 retry (+ отдельные бэкоффы на 429), маркеры
 * в .zscripts/restyle-done/<name>, лог .zscripts/restyle-photos.log.
 * Перезапуск докатывает только недоделанные.
 *
 * ЗАМЕЧАНИЕ: CLI `z-ai image-edit` (SDK 0.0.18) отправляет устаревшее тело
 * {image: dataUrl} — шлюз отвечает 400 «image_to_image task must provide images».
 * Рабочая форма (проверено зондом, 200 OK): {prompt, images: [{url: dataUrl}], size}.
 * Поэтому вызов идёт напрямую через SDK zai.images.generations.edit.
 * Ещё найдено (слепой A/B через vision): модель edit stubbornly сохраняет боке
 * исходника, но с нейтральным вопросом результат уже читается как
 * «обычный человек снимает дома телефон» — постэффекты добивают остаток «профессиональности».
 *
 * Запуск: cd /home/z/my-project && setsid nohup bun .zscripts/restyle-photos.ts >/dev/null 2>&1 &
 */
import { readdirSync, mkdirSync, existsSync, renameSync, rmSync, statSync, writeFileSync, appendFileSync, readFileSync } from "fs";
import { join } from "path";
import ZAI from "z-ai-web-dev-sdk";

const ROOT = "/home/z/my-project";
const SRC_DIR = join(ROOT, "public/img/p");
const TMP_PNG_DIR = "/tmp/restyle";
const DONE_DIR = join(ROOT, ".zscripts/restyle-done");
const LOG = join(ROOT, ".zscripts/restyle-photos.log");
const CONCURRENCY = 3;
const RETRIES = 1; // 1 retry при ошибке
const RATE_RETRIES = 4; // доп. бэкофф-повторы только для 429

mkdirSync(TMP_PNG_DIR, { recursive: true });
mkdirSync(DONE_DIR, { recursive: true });

const surfaces = [
  "a wooden table",
  "a wooden floor",
  "a carpet",
  "a kitchen table",
  "a windowsill",
  "a balcony floor",
];

const promptFor = (surface: string) =>
  `Rework this exact photo into a casual amateur smartphone photo of the same used item, taken at home to sell on a classifieds website: bright natural daylight from a window, item placed on ${surface}, realistic signs of everyday use like light dust, fingerprints and small scuffs, ordinary slightly messy home background, plain point-and-shoot framing shot with a cheap phone camera: deep focus, everything in the frame is sharp, the background is clearly visible with no blur at all, slightly imperfect casual composition, no studio lighting, no cinematic look, no bokeh, no dramatic shadows, keep the item itself identical`;

function log(name: string, status: string, ms: number) {
  appendFileSync(LOG, `${new Date().toISOString()}\t${name}\t${status}\t${ms}ms\n`);
}

const baseOf = (f: string) => f.replace(/\.jpe?g$/i, "");

const zai: any = await (ZAI as any).create();

async function editImage(src: string, prompt: string, png: string): Promise<void> {
  const b64 = readFileSync(src).toString("base64");
  const body = {
    prompt,
    images: [{ url: `data:image/jpeg;base64,${b64}` }],
    size: "1024x1024",
  };
  for (let attempt = 0; attempt <= RATE_RETRIES; attempt++) {
    try {
      const res = await zai.images.generations.edit(body);
      const item = res?.data?.[0];
      if (!item?.base64) throw new Error("no image in response");
      writeFileSync(png, Buffer.from(item.base64, "base64"));
      if (statSync(png).size < 5000) throw new Error("png too small");
      return;
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      const is429 = msg.includes("429");
      if (!is429 || attempt === RATE_RETRIES) throw new Error(msg.slice(0, 220));
      await new Promise((r) => setTimeout(r, 12_000 * (attempt + 1)));
    }
  }
}

async function processOne(job: { file: string; idx: number }): Promise<void> {
  const { file, idx } = job;
  const base = baseOf(file);
  const src = join(SRC_DIR, file);
  const png = join(TMP_PNG_DIR, `${base}.png`);
  // временный jpg в ЦЕЛЕВОЙ папке → rename атомарен на том же устройстве
  const tmpJpg = join(SRC_DIR, `.${base}.restyle-tmp.jpg`);
  const prompt = promptFor(surfaces[idx % surfaces.length]);
  const start = Date.now();

  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      await editImage(src, prompt, png);
      const conv = Bun.spawnSync(
        ["python3", join(ROOT, ".zscripts/png2jpg.py"), png, tmpJpg],
        { timeout: 60_000, stdout: "ignore", stderr: "pipe" },
      );
      if (conv.exitCode !== 0 || !existsSync(tmpJpg) || statSync(tmpJpg).size < 3000) {
        throw new Error(`png2jpg failed: ${conv.stderr?.toString().slice(-200) ?? ""}`);
      }
      // любительские пост-эффекты (зерно, плоский грейд, микро-поворот) во временный файл
      const finalJpg = join(SRC_DIR, `.${base}.restyle-fin.jpg`);
      const fx = Bun.spawnSync(
        ["python3", join(ROOT, ".zscripts/postfx.py"), tmpJpg, finalJpg, base],
        { timeout: 60_000, stdout: "ignore", stderr: "pipe" },
      );
      rmSync(tmpJpg, { force: true });
      if (fx.exitCode !== 0 || !existsSync(finalJpg) || statSync(finalJpg).size < 3000) {
        throw new Error(`postfx failed: ${fx.stderr?.toString().slice(-200) ?? ""}`);
      }
      renameSync(finalJpg, src); // атомарная перезапись public/img/p/<name>.jpg
      writeFileSync(join(DONE_DIR, base), `${Date.now()}\n`);
      rmSync(png, { force: true });
      okCount++;
      log(file, "ok", Date.now() - start);
      return;
    } catch (e: any) {
      rmSync(tmpJpg, { force: true });
      rmSync(join(SRC_DIR, `.${base}.restyle-fin.jpg`), { force: true });
      if (attempt === RETRIES) {
        // включая ошибки контент-фильтра: логируем fail и идём дальше
        failCount++;
        log(file, `fail: ${String(e?.message ?? e).slice(0, 220)}`, Date.now() - start);
      } else {
        log(file, "retry", Date.now() - start);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }
}

async function worker(): Promise<void> {
  while (true) {
    const i = cursor++;
    if (i >= todo.length) return;
    await processOne(todo[i]);
  }
}

// dotfiles (.name.restyle-tmp.jpg / .restyle-fin.jpg) — служебные, не задания
for (const f of readdirSync(SRC_DIR)) if (f.startsWith(".")) rmSync(join(SRC_DIR, f), { force: true });
const files = readdirSync(SRC_DIR)
  .filter((f) => !f.startsWith(".") && f.toLowerCase().endsWith(".jpg"))
  .sort();
const todo = files
  .map((f, i) => ({ file: f, idx: i }))
  .filter(({ file }) => !existsSync(join(DONE_DIR, baseOf(file))));

const t0 = Date.now();
let okCount = 0;
let failCount = 0;
let cursor = 0;

log("PLAN", `total=${files.length} todo=${todo.length} conc=${CONCURRENCY}`, 0);

await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

log("DONE", `ok=${okCount} fail=${failCount} elapsedMin=${((Date.now() - t0) / 60000).toFixed(1)}`, Date.now() - t0);
