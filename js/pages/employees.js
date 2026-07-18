import { getAll, addRecord, updateRecord, deleteRecord, uploadFile, deleteFile, compressImage } from "../db.js";
import { el, toast, fmtDate, openModal, closeModal, confirmDialog, loadingRow, emptyRow, debounce } from "../utils.js";

let allEmployees = [];
let filterStatus = "all";
let searchTerm = "";

export async function render(root) {
  root.appendChild(el("div", { class: "section-title" }, "Employees"));

  const toolbar = el("div", { class: "toolbar" }, [
    el("input", { class: "search", placeholder: "Search by name…", oninput: debounce((e) => { searchTerm = e.target.value.toLowerCase(); renderTable(); }, 250) }),
    el("select", { onchange: (e) => { filterStatus = e.target.value; renderTable(); } }, [
      el("option", { value: "all" }, "All"),
      el("option", { value: "active" }, "Active"),
      el("option", { value: "inactive" }, "Inactive"),
    ]),
    el("div", { class: "spacer" }),
    el("button", { class: "btn btn-primary", onclick: () => openEmployeeModal() }, "＋ Add Employee"),
  ]);
  root.appendChild(toolbar);

  const tableWrap = el("div", { class: "table-wrap" }, el("table", {}, [
    el("thead", {}, el("tr", {}, ["Name", "DOB", "Joining Date", "Last Date", "Status", "Aadhar", ""].map((h) => el("th", {}, h)))),
    el("tbody", { id: "emp-tbody" }, loadingRow(7)),
  ]));
  root.appendChild(tableWrap);

  allEmployees = await getAll("employees", { orderBy: ["name", "asc"] });
  renderTable();

  function renderTable() {
    const tbody = root.querySelector("#emp-tbody");
    let rows = allEmployees.filter((e) => {
      const isActive = !e.lastDate;
      if (filterStatus === "active" && !isActive) return false;
      if (filterStatus === "inactive" && isActive) return false;
      if (searchTerm && !e.name?.toLowerCase().includes(searchTerm)) return false;
      return true;
    });
    if (!rows.length) { tbody.innerHTML = emptyRow(7, "No employees match."); return; }
    tbody.innerHTML = "";
    rows.forEach((emp) => {
      const active = !emp.lastDate;
      tbody.appendChild(el("tr", {}, [
        el("td", {}, emp.name),
        el("td", { class: "num" }, fmtDate(emp.dob)),
        el("td", { class: "num" }, fmtDate(emp.joiningDate)),
        el("td", { class: "num" }, emp.lastDate ? fmtDate(emp.lastDate) : "—"),
        el("td", {}, el("span", { class: `badge badge-${active ? "active" : "inactive"}` }, active ? "Active" : "Inactive")),
        el("td", {}, emp.aadharFileUrl
          ? el("a", { href: emp.aadharFileUrl, target: "_blank", class: "btn btn-sm btn-ghost" }, "View")
          : "—"),
        el("td", {}, [
          el("button", { class: "icon-btn", title: "Edit", onclick: () => openEmployeeModal(emp) }, el("span", { "data-ic": "edit" })),
          el("button", { class: "icon-btn", title: "Delete", onclick: () => handleDelete(emp) }, el("span", { "data-ic": "trash" })),
        ]),
      ]));
    });
    import("../icons.js").then((m) => m.hydrateIcons(tbody));
  }

  async function handleDelete(emp) {
    const ok = await confirmDialog(`Delete ${emp.name}? This cannot be undone.`);
    if (!ok) return;
    if (emp.aadharFilePath) await deleteFile(emp.aadharFilePath);
    await deleteRecord("employees", emp.id);
    allEmployees = allEmployees.filter((e) => e.id !== emp.id);
    renderTable();
    toast("Employee deleted", "success");
  }

  function openEmployeeModal(emp) {
    const isEdit = !!emp;
    const name = el("input", { required: "required", value: emp?.name || "" });
    const dob = el("input", { type: "date", required: "required", value: emp?.dob || "" });
    const address = el("textarea", { rows: "2" }, emp?.address || "");
    const joiningDate = el("input", { type: "date", required: "required", value: emp?.joiningDate || "" });
    const lastDate = el("input", { type: "date", value: emp?.lastDate || "" });
    const fileInput = el("input", { type: "file", accept: "image/*,.pdf" });
    const fileStatus = el("div", { class: "help-text" }, emp?.aadharFileName ? `Current file: ${emp.aadharFileName}` : "PDF or image, will be compressed if it's a photo.");
    const errorMsg = el("p", { class: "login-error" }, "");

    const form = el("form", { class: "form-grid" }, [
      el("label", { class: "field full" }, [el("span", {}, "Name"), name]),
      el("label", { class: "field" }, [el("span", {}, "Date of Birth"), dob]),
      el("label", { class: "field" }, [el("span", {}, "Joining Date"), joiningDate]),
      el("label", { class: "field" }, [el("span", {}, "Last Date (leave blank if active)"), lastDate]),
      el("label", { class: "field" }, [el("span", {}, "Aadhar Proof"), fileInput, fileStatus]),
      el("label", { class: "field full" }, [el("span", {}, "Address"), address]),
      errorMsg,
      el("div", { class: "modal-actions full" }, [
        el("button", { type: "button", class: "btn btn-ghost", onclick: closeModal }, "Cancel"),
        el("button", { type: "submit", class: "btn btn-primary" }, isEdit ? "Save Changes" : "Add Employee"),
      ]),
    ]);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!name.value.trim() || !dob.value || !joiningDate.value) {
        errorMsg.textContent = "Please fill in all required fields.";
        return;
      }
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = "Saving…";
      try {
        const data = {
          name: name.value.trim(),
          dob: dob.value,
          address: address.value.trim(),
          joiningDate: joiningDate.value,
          lastDate: lastDate.value || null,
        };
        if (fileInput.files[0]) {
          const compressed = await compressImage(fileInput.files[0]);
          const uploaded = await uploadFile(compressed.name, compressed);
          data.aadharFileUrl = uploaded.url;
          data.aadharFilePath = uploaded.fileId;
          data.aadharFileName = fileInput.files[0].name;
        }
        if (isEdit) {
          await updateRecord("employees", emp.id, data);
          Object.assign(emp, data);
        } else {
          const id = await addRecord("employees", data);
          allEmployees.push({ id, ...data });
        }
        allEmployees.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        renderTable();
        closeModal();
        toast(isEdit ? "Employee updated" : "Employee added", "success");
      } catch (err) {
        console.error(err);
        errorMsg.textContent = "Could not save. Check your connection and try again.";
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = isEdit ? "Save Changes" : "Add Employee";
      }
    });

    openModal(isEdit ? "Edit Employee" : "Add Employee", form, { wide: true });
  }
}
