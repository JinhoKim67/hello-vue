// src/composables/useHalCrud.js
import { ref, reactive, computed } from "vue";
import axios from "axios";

const ACCEPT = "application/hal+json, application/json";
const NO_CACHE_HEADERS = {
  Accept: ACCEPT,
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
};

async function fetchFresh(url) {
  try {
    const res = await axios.get(url, { headers: NO_CACHE_HEADERS });
    return { entity: res.data, etag: res.headers?.etag ?? null };
  } catch (e) {
    if (e?.response?.status === 404) return null;
    throw e;
  }
}

async function patchOrPut(url, body, headers = {}) {
  try {
    return await axios.patch(url, body, { headers });
  } catch (e) {
    if (e?.response?.status === 405) {
      return await axios.put(url, body, { headers });
    }
    throw e;
  }
}

function idFromHref(href) {
  const m = String(href).match(/\/([^\/\?]+)(\?.*)?$/);
  return m ? m[1] : "-";
}

export function useHalCrud(config) {
  // config:
  // { title, itemLabel, collectionUrl, searchUrl, embeddedKey, fields, columns, requiredKeys? }

  const loading = ref(false);
  const status = ref("idle");
  const debug = ref("");

  const items = ref([]);
  const searchQ = ref("");

  const form = reactive(makeEmptyForm(config.fields));
  const editModal = reactive({
    open: false,
    url: null,
    etag: null,
    form: makeEmptyForm(config.fields),
  });

  const requiredKeys = config.requiredKeys ?? ["name"];

  const canCreate = computed(() =>
    requiredKeys.every((k) => String(form[k] ?? "").trim().length > 0)
  );
  const canSaveEdit = computed(
    () =>
      editModal.open &&
      requiredKeys.every((k) => String(editModal.form[k] ?? "").trim().length > 0)
  );

  function setStatus(msg, obj) {
    status.value = msg;
    if (obj !== undefined) {
      try {
        debug.value = JSON.stringify(obj, null, 2);
      } catch {
        debug.value = String(obj);
      }
    }
  }

  function errInfo(err) {
    return {
      message: err?.message,
      status: err?.response?.status,
      data: err?.response?.data,
    };
  }

  async function request(label, fn) {
    loading.value = true;
    setStatus(label);
    try {
      const res = await fn();
      setStatus(`${label} OK`, res?.data ?? res);
      return res;
    } catch (err) {
      setStatus(`${label} FAILED`, errInfo(err));
      throw err;
    } finally {
      loading.value = false;
    }
  }

  function extractItems(data) {
    return data?._embedded?.[config.embeddedKey] ?? [];
  }

  function idFromSelf(u) {
    return idFromHref(u?._links?.self?.href);
  }

  function buildPayload(srcForm) {
    const out = {};
    for (const f of config.fields) {
      const v = String(srcForm[f.key] ?? "").trim();
      out[f.key] = v.length ? v : null;
    }
    return out;
  }

  async function load(url = config.collectionUrl) {
    const res = await request(`load ${config.embeddedKey}`, () =>
      axios.get(url, { headers: { Accept: ACCEPT } })
    );
    items.value = extractItems(res.data);
    status.value = `loaded ${items.value.length}`;
  }

  async function search() {
    const q = searchQ.value.trim();
    if (!q) return load(config.collectionUrl);
    return load(`${config.searchUrl}?q=${encodeURIComponent(q)}`);
  }

  async function create() {
    if (!canCreate.value) return;

    const payload = buildPayload(form);

    await request(`create ${config.itemLabel}`, () =>
      axios.post(config.collectionUrl, payload, {
        headers: { "Content-Type": "application/json" },
      })
    );

    Object.assign(form, makeEmptyForm(config.fields));
    return load(config.collectionUrl);
  }

  async function openEdit(u) {
    const url = u?._links?.self?.href;
    if (!url) return setStatus("edit canceled: invalid self link");

    try {
      const fresh = await fetchFresh(url);
      if (fresh === null) {
        window.alert("해당 데이터가 이미 삭제되어 편집할 수 없습니다. 목록을 새로고침합니다.");
        closeEdit();
        await search();
        return;
      }

      editModal.open = true;
      editModal.url = url;
      editModal.etag = fresh.etag;

      // entity -> modal form 채우기
      for (const f of config.fields) {
        editModal.form[f.key] = (fresh.entity?.[f.key] ?? "").toString();
      }
    } catch (err) {
      setStatus("open edit FAILED", errInfo(err));
    }
  }

  function closeEdit() {
    editModal.open = false;
    editModal.url = null;
    editModal.etag = null;
    editModal.form = makeEmptyForm(config.fields);
  }

  async function saveEdit() {
    if (!canSaveEdit.value) return;
    const url = editModal.url;
    if (!url) return;

    const payload = buildPayload(editModal.form);

    try {
      await request(`update ${config.itemLabel}`, async () => {
        const fresh = await fetchFresh(url);
        if (fresh === null) {
          const e = new Error("already deleted");
          e.response = { status: 404, data: "already deleted" };
          throw e;
        }

        const headers = { "Content-Type": "application/json" };
        const etag = fresh.etag ?? editModal.etag;
        if (etag) headers["If-Match"] = etag;

        return patchOrPut(url, payload, headers);
      });

      closeEdit();
      return search();
    } catch (err) {
      const s = err?.response?.status;

      if (s === 404) {
        window.alert("저장 실패: 해당 데이터가 이미 삭제되었습니다. 목록을 새로고침합니다.");
        closeEdit();
        await search();
        return;
      }
      if (s === 412 || s === 409) {
        window.alert("저장 실패: 다른 곳에서 먼저 수정되었습니다. 목록을 새로고침합니다.");
        closeEdit();
        await search();
        return;
      }
    }
  }

  async function remove(u) {
    const ok = window.confirm(`Delete ${config.itemLabel}`);
    if (!ok) return;

    const url = u?._links?.self?.href;
    if (!url) return;

    try {
      await request(`delete ${config.itemLabel}`, async () => {
        const fresh = await fetchFresh(url);
        if (fresh === null) {
          const e = new Error("already deleted");
          e.response = { status: 404, data: "already deleted" };
          throw e;
        }

        const headers = {};
        if (fresh.etag) headers["If-Match"] = fresh.etag;

        return axios.delete(url, { headers });
      });

      if (editModal.url === url) closeEdit();
      return search();
    } catch (err) {
      const s = err?.response?.status;

      if (s === 404) {
        window.alert("삭제 실패: 해당 데이터가 이미 삭제되었습니다. 목록을 새로고침합니다.");
        if (editModal.url === url) closeEdit();
        await search();
        return;
      }
      if (s === 412 || s === 409) {
        window.alert("삭제 실패: 다른 곳에서 먼저 변경되었습니다. 목록을 새로고침합니다.");
        if (editModal.url === url) closeEdit();
        await search();
        return;
      }
    }
  }

  return {
    // state
    loading,
    status,
    debug,
    items,
    searchQ,
    form,
    editModal,

    // computed
    canCreate,
    canSaveEdit,

    // utils
    idFromSelf,

    // actions
    load,
    search,
    create,
    openEdit,
    closeEdit,
    saveEdit,
    remove,
  };
}

function makeEmptyForm(fields) {
  const obj = {};
  for (const f of fields) obj[f.key] = "";
  return obj;
}