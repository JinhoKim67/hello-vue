<template>
  <div style="padding:16px;">
    <h3>Computers CRUD</h3>

    <!-- Search -->
    <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end; margin-bottom:12px;">
      <div><input v-model="searchQ" placeholder="name" /></div>
      <button @click="searchComputer">검색</button>
    </div>

    <!-- Create -->
    <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end; margin-bottom:12px;">
      <div><input v-model="form.name" placeholder="name" /></div>
      <div><input v-model="form.model" placeholder="model" /></div>
      <div><input v-model="form.spec" placeholder="spec" /></div>
      <button @click="createComputer" :disabled="!canCreate">생성</button>
    </div>

    <div style="margin:8px 0;">
      <b>Status:</b> {{ status }}
      <span v-if="loading"> (loading...)</span>
    </div>

    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse; width:100%;">
      <thead>
        <tr>
          <th style="width:80px;">ID</th>
          <th>종류</th>
          <th>모델</th>
          <th>사양</th>
          <th style="width:240px;">Actions</th>
        </tr>
      </thead>

      <tbody>
        <tr v-for="u in computers" :key="u._links.self.href">
          <td>{{ idFromSelf(u) }}</td>
          <td>{{ u.name }}</td>
          <td>{{ u.model }}</td>
          <td>{{ u.spec }}</td>
          <td>
            <button @click="openEdit(u)">Edit</button>
            <button @click="deleteComputer(u)">Delete</button>
          </td>
        </tr>

        <tr v-if="computers.length === 0">
          <td colspan="5" style="text-align:center; opacity:.7;">No computers</td>
        </tr>
      </tbody>
    </table>

    <pre style="margin-top:12px; background:#f6f6f6; padding:10px;">{{ debug }}</pre>

    <!-- ===== Modal (Edit Popup) ===== -->
    <div v-if="editModal.open" class="backdrop" @click.self="closeEdit">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">Edit Computer</div>
          <button class="x" @click="closeEdit" aria-label="close">✕</button>
        </div>

        <div class="modal-body">
          <div class="row">
            <label>Name</label>
            <input v-model="editModal.form.name" placeholder="name" />
          </div>
          <div class="row">
            <label>Email</label>
            <input v-model="editModal.form.email" placeholder="email" />
          </div>
          <div class="row">
            <label>Phone</label>
            <input v-model="editModal.form.phone" placeholder="phone" />
          </div>
        </div>

        <div class="modal-footer">
          <button @click="saveEdit" :disabled="!canSaveEdit">저장</button>
          <button @click="closeEdit">취소</button>
        </div>
      </div>
    </div>
    <!-- ===== /Modal ===== -->
  </div>
</template>

<script>
import axios from "axios";

const BASE = import.meta.env.VITE_BACKEND;
const API = {
  computers: `${BASE}/computers`,
  search: `${BASE}/computers/search/findByNameContainingIgnoreCase`,
};

const ACCEPT = "application/hal+json, application/json";
const NO_CACHE_HEADERS = {
  Accept: ACCEPT,
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
};

// 최신 상태(ETag 포함) 다시 조회: 404면 null
async function fetchComputerFresh(url) {
  try {
    const res = await axios.get(url, { headers: NO_CACHE_HEADERS });
    return { computer: res.data, etag: res.headers?.etag ?? null };
  } catch (e) {
    if (e?.response?.status === 404) return null;
    throw e;
  }
}

// PATCH 우선 -> 405면 PUT
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

export default {
  data() {
    return {
      loading: false,
      status: "idle",
      debug: "",

      computers: [],
      searchQ: "",

      // create
      form: { name: "", email: "", phone: "" },

      // edit modal
      editModal: {
        open: false,
        url: null,
        etag: null,
        form: { name: "", email: "", phone: "" },
      },
    };
  },

  computed: {
    canCreate() {
      return this.form.name.trim().length > 0;
    },
    canSaveEdit() {
      return this.editModal.open && this.editModal.form.name.trim().length > 0;
    },
  },

  mounted() {
    this.loadComputers(API.computers);
  },

  methods: {
    // ---------- utils ----------
    idFromHref(href) {
      const m = String(href).match(/\/([^\/\?]+)(\?.*)?$/);
      return m ? m[1] : "-";
    },
    idFromSelf(u) {
      return this.idFromHref(u?._links?.self?.href);
    },
    extractComputers(data) {
      return data?._embedded?.computers ?? [];
    },
    setStatus(msg, obj) {
      this.status = msg;
      if (obj !== undefined) {
        try {
          this.debug = JSON.stringify(obj, null, 2);
        } catch {
          this.debug = String(obj);
        }
      }
    },
    errInfo(err) {
      return {
        message: err?.message,
        status: err?.response?.status,
        data: err?.response?.data,
      };
    },

    // ---------- request wrapper ----------
    async request(label, fn) {
      this.loading = true;
      this.setStatus(label);
      try {
        const res = await fn();
        this.setStatus(`${label} OK`, res?.data ?? res);
        return res;
      } catch (err) {
        this.setStatus(`${label} FAILED`, this.errInfo(err));
        throw err;
      } finally {
        this.loading = false;
      }
    },

    async refreshWithNotFoundNotice(notice, err) {
      this.setStatus(notice, err ? this.errInfo(err) : undefined);
      window.alert(notice);
      // 모달이 열려있으면 닫아 주는 게 UX가 안정적
      if (this.editModal.open) this.closeEdit();
      await this.searchComputer(); // 현재 검색 조건 유지한 채 refresh
    },

    // ---------- list/search ----------
    async loadComputers(url) {
      const res = await this.request("load computers", () =>
        axios.get(url, { headers: { Accept: ACCEPT } })
      );
      this.computers = this.extractComputers(res.data);
      this.status = `loaded ${this.computers.length}`;
    },

    searchComputer() {
      const q = this.searchQ.trim();
      if (!q) return this.loadComputers(API.computers);
      return this.loadComputers(`${API.search}?q=${encodeURIComponent(q)}`);
    },

    // ---------- create ----------
    async createComputer() {
      if (!this.canCreate) return;

      const payload = {
        name: this.form.name.trim(),
        model: this.form.model.trim() || null,
        spec: this.form.spec.trim() || null,
      };

      await this.request("create computer", () =>
        axios.post(API.computers, payload, {
          headers: { "Content-Type": "application/json" },
        })
      );

      this.form = { name: "", model: "", spec: "" };
      return this.loadComputers(API.computers);
    },

    // ---------- edit modal ----------
    async openEdit(u) {
      const url = u?._links?.self?.href;
      if (!url) {
        this.setStatus("edit canceled: invalid self link");
        return;
      }

      try {
        const fresh = await fetchComputerFresh(url);
        if (fresh === null) {
          await this.refreshWithNotFoundNotice(
            "해당 데이터가 이미 삭제되어 편집할 수 없습니다. 목록을 새로고침합니다."
          );
          return;
        }

        this.editModal.open = true;
        this.editModal.url = url;
        this.editModal.etag = fresh.etag;
        this.editModal.form = {
          name: (fresh.computer?.name ?? "").toString(),
          model: (fresh.computer?.model ?? "").toString(),
          spec: (fresh.computer?.spec ?? "").toString(),
        };
      } catch (err) {
        this.setStatus("open edit FAILED", this.errInfo(err));
      }
    },

    closeEdit() {
      this.editModal.open = false;
      this.editModal.url = null;
      this.editModal.etag = null;
      this.editModal.form = { name: "", model: "", spec: "" };
    },

    async saveEdit() {
      if (!this.canSaveEdit) return;

      const url = this.editModal.url;
      if (!url) return;

      const payload = {
        name: this.editModal.form.name.trim(),
        model: this.editModal.form.model.trim() || null,
        spec: this.editModal.form.spec.trim() || null,
      };

      try {
        await this.request("update computer", async () => {
          const fresh = await fetchComputerFresh(url);
          if (fresh === null) {
            const e = new Error("already deleted");
            e.response = { status: 404, data: "already deleted" };
            throw e;
          }

          const headers = { "Content-Type": "application/json" };
          const etag = fresh.etag ?? this.editModal.etag;
          if (etag) headers["If-Match"] = etag;

          return patchOrPut(url, payload, headers);
        });

        this.closeEdit();
        return this.searchComputers();
      } catch (err) {
        const s = err?.response?.status;

        if (s === 404) {
          await this.refreshWithNotFoundNotice(
            "저장 실패: 해당 데이터가 이미 삭제되었습니다. 목록을 새로고침합니다.",
            err
          );
          return;
        }
        if (s === 412 || s === 409) {
          // 원래 로직대로 refresh하되, 사용자에게도 안내
          this.setStatus("update failed: conflict (refreshing list)", this.errInfo(err));
          window.alert("저장 실패: 다른 곳에서 먼저 수정되었습니다. 목록을 새로고침합니다.");
          this.closeEdit();
          await this.searchComputers();
          return;
        }
        // 기타 에러는 기존 status에 남김
        return;
      }
    },


    // ---------- delete ----------
    async deleteComputer(u) {
      const ok = window.confirm("Delete Computer");
      if (!ok) return;

      const url = u?._links?.self?.href;
      if (!url) return;

      try {
        await this.request("delete computer", async () => {
          const fresh = await fetchComputerFresh(url);
          // 이미 삭제된 상태(404)면 "없음" 안내 후 refresh
          if (fresh === null) {
            const e = new Error("already deleted");
            e.response = { status: 404, data: "already deleted" };
            throw e;
          }

          const headers = {};
          if (fresh.etag) headers["If-Match"] = fresh.etag;

          return axios.delete(url, { headers });
        });

        // 삭제 성공
        if (this.editModal.url === url) this.closeEdit();
        return this.searchComputers();
      } catch (err) {
        const s = err?.response?.status;

        if (s === 404) {
          await this.refreshWithNotFoundNotice(
            "삭제 실패: 해당 데이터가 이미 삭제되었습니다. 목록을 새로고침합니다.",
            err
          );
          return;
        }
        if (s === 412 || s === 409) {
          this.setStatus("delete failed: conflict (refreshing list)", this.errInfo(err));
          window.alert("삭제 실패: 다른 곳에서 먼저 변경되었습니다. 목록을 새로고침합니다.");
          if (this.editModal.url === url) this.closeEdit();
          await this.searchComputers();
          return;
        }

        // 기타 에러
        this.setStatus("delete FAILED", this.errInfo(err));
      }
    },
  },
};
</script>

<style scoped>
input {
  padding: 6px 8px;
  min-width: 240px;
}

button {
  padding: 6px 10px;
}

/* Modal styles */
.backdrop{
  position:fixed; inset:0;
  background:rgba(0,0,0,.5);
  display:flex; align-items:center; justify-content:center;
}

.modal{
  width:min(560px, 90vw);
  background:#111; color:#fff;
  border:1px solid #333; border-radius:10px;
  padding:14px;
}

.modal-header,
.modal-footer{
  display:flex; justify-content:space-between; align-items:center;
}

.modal-body{ margin:12px 0; }

.row{
  display:grid;
  grid-template-columns:90px 1fr;
  gap:10px; align-items:center;
}

.x{ background:transparent; border:0; color:#fff; cursor:pointer; }
</style>