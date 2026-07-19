import { getAll, getOne, clearCollection, batchUpsert } from "../db.js";
import { el, toast, downloadJSON, confirmDialog, openModal, closeModal } from "../utils.js";

const COLLECTIONS = ["employees", "attendance", "dailySales", "stockEntries", "expenses", "recurringExpenses", "feedback", "feedbackMaster", "targets"];
const SINGLE_DOCS = { settings: ["stockCounter"] };

export async function render(root) {
  root.appendChild(el("div", { class: "section-title" }, "Settings & Backup"));

  // ---- Target ----
  const targetLink = el("a", { href: "#/target", class: "btn btn-ghost" }, "Go to Monthly Target →");
  root.appendChild(el("div", { class: "card card-pad" }, [
    el("h3", { style: "margin-top:0;font-family:var(--font-display);color:var(--ink)" }, "Monthly Target"),
    el("p", { class: "help-text" }, "Targets are now set per month, with a full history. Manage them from their own page."),
    targetLink,
  ]));

  root.appendChild(el("div", { class: "stitch" }));

  // ---- Backup ----
  const backupBtn = el("button", { class: "btn btn-gold" }, [el("span", { "data-ic": "download" }), " Download All Data"]);
  backupBtn.addEventListener("click", async () => {
    backupBtn.disabled = true;
    backupBtn.textContent = "Preparing backup…";
    try {
      const data = {};
      for (const col of COLLECTIONS) data[col] = await getAll(col, { skipCache: true });
      data.settings = {};
      for (const id of SINGLE_DOCS.settings) {
        const doc = await getOne("settings", id);
        if (doc) data.settings[id] = doc;
      }
      data._exportedAt = new Date().toISOString();
      downloadJSON(data, `maybell-backup-${new Date().toISOString().slice(0, 10)}.json`);
      toast("Backup downloaded", "success");
    } catch (err) {
      console.error(err);
      toast("Backup failed — check your connection", "error");
    } finally {
      backupBtn.disabled = false;
      backupBtn.innerHTML = "";
      backupBtn.appendChild(el("span", { "data-ic": "download" }));
      backupBtn.append(" Download All Data");
      import("../icons.js").then((m) => m.hydrateIcons(backupBtn));
    }
  });

  const restoreInput = el("input", { type: "file", accept: "application/json" });
  const restoreBtn = el("button", { class: "btn btn-ghost" }, [el("span", { "data-ic": "upload" }), " Restore from Backup"]);
  restoreBtn.addEventListener("click", () => restoreInput.click());
  restoreInput.addEventListener("change", () => handleRestoreFile(restoreInput.files[0]));

  root.appendChild(el("div", { class: "card card-pad" }, [
    el("h3", { style: "margin-top:0;font-family:var(--font-display);color:var(--ink)" }, "Backup & Restore"),
    el("p", { class: "help-text" }, "Download everything as one JSON file — cheap insurance if the Google Sheet or Apps Script setup ever breaks. Restoring lets you repopulate from a previous backup file."),
    el("div", { style: "display:flex;gap:10px;flex-wrap:wrap;margin-top:12px" }, [backupBtn, restoreBtn, restoreInput]),
  ]));
  restoreInput.style.display = "none";
  import("../icons.js").then((m) => { m.hydrateIcons(backupBtn); m.hydrateIcons(restoreBtn); });

  async function handleRestoreFile(file) {
    if (!file) return;
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      toast("That file isn't valid JSON", "error");
      return;
    }
    const foundCollections = Object.keys(parsed).filter((k) => COLLECTIONS.includes(k));
    if (!foundCollections.length) {
      toast("This doesn't look like a Maybell backup file", "error");
      return;
    }

    const modeBody = el("div", {}, [
      el("p", {}, `Found data for: ${foundCollections.join(", ")}${parsed.settings ? ", settings" : ""}.`),
      el("p", { style: "font-weight:600" }, "Choose how to restore:"),
      el("div", { style: "display:flex;flex-direction:column;gap:10px" }, [
        modeCard("merge", "Merge", "Add new records and update matching ones. Keeps anything already saved that isn't in the backup."),
        modeCard("replace", "Replace", "Wipe these collections completely, then load the backup. Anything not in the backup is permanently lost."),
      ]),
    ]);
    openModal("Restore from Backup", modeBody, { wide: true });

    function modeCard(mode, title, desc) {
      const card = el("div", { class: "card card-pad", style: "cursor:pointer" }, [
        el("strong", {}, title), el("div", { class: "help-text" }, desc),
      ]);
      card.addEventListener("click", async () => {
        closeModal();
        const ok = await confirmDialog(
          mode === "replace"
            ? "This will permanently DELETE existing data in these collections before restoring. This can't be undone. Continue?"
            : "This will add/update records from the backup into your current data. Continue?"
        );
        if (!ok) return;
        await runRestore(parsed, foundCollections, mode);
      });
      return card;
    }
  }

  async function runRestore(parsed, foundCollections, mode) {
    toast("Restoring… this may take a moment", "info");
    try {
      for (const col of foundCollections) {
        if (mode === "replace") {
          await clearCollection(col);
        }
        const records = parsed[col]
          .filter((r) => r.id)
          .map((r) => { const { id, ...data } = r; return { id, data, merge: true }; });
        if (records.length) await batchUpsert(col, records);
      }
      if (parsed.settings) {
        const records = Object.entries(parsed.settings).map(([id, data]) => {
          const { id: _drop, ...rest } = data;
          return { id, data: rest, merge: true };
        });
        if (records.length) await batchUpsert("settings", records);
      }
      toast("Restore complete", "success");
    } catch (err) {
      console.error(err);
      toast("Restore failed partway — check console for details", "error");
    }
  }
}
