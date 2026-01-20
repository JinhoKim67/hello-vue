<template>
  <div style="padding:16px;">
    <h3>Users CRUD</h3>

    <!-- Search -->
    <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end; margin-bottom:12px;">
      <div><input v-model="searchQ" placeholder="name" /></div>
      <button @click="searchUser">검색</button>
    </div>

    <!-- Create -->
    <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end; margin-bottom:12px;">
      <div><input v-model="form.name" placeholder="name" /></div>
      <div><input v-model="form.email" placeholder="email" /></div>
      <div><input v-model="form.phone" placeholder="phone" /></div>
      <button @click="createUser" :disabled="!canCreate">생성</button>
    </div>

    <!-- Edit (Create 영역처럼) -->
    <div v-if="editing.url" style="display:flex; gap:10px; flex-wrap:wrap; align-items:end; margin-bottom:12px;">
      <div><input v-model="editForm.name" placeholder="name" /></div>
      <div><input v-model="editForm.email" placeholder="email" /></div>
      <div><input v-model="editForm.phone" placeholder="phone" /></div>
      <button @click="updateUser" :disabled="!canUpdate">수정</button>
      <button @click="cancelEdit">취소</button>
    </div>

    <div style="margin:8px 0;">
      <b>Status:</b> {{ status }}
      <span v-if="loading"> (loading...)</span>
    </div>

    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse; width:100%;">
      <thead>
        <tr>
          <th style="width:80px;">ID</th>
          <th>이름</th>
          <th>이메일</th>
          <th>전화번호</th>
          <th style="width:240px;">Actions</th>
        </tr>
      </thead>

      <tbody>
        <tr v-for="u in users" :key="u._links.self.href">
          <td>{{ idFromSelf(u) }}</td>
          <td>{{ u.name }}</td>
          <td>{{ u.email }}</td>
          <td>{{ u.phone }}</td>
          <td>
            <button @click="startEdit(u)">Edit</button>
            <button @click="deleteUser(u)">Delete</button>
          </td>
        </tr>

        <tr v-if="users.length === 0">
          <td colspan="5" style="text-align:center; opacity:.7;">No users</td>
        </tr>
      </tbody>
    </table>

    <pre style="margin-top:12px; background:#f6f6f6; padding:10px;">{{ debug }}</pre>
  </div>
</template>

<script>
import axios from "axios";

const BASE = import.meta.env.VITE_BACKEND;
const API = {
  users: `${BASE}/users`,
  search: `${BASE}/users/search/findByNameContainingIgnoreCase`,
};

const ACCEPT = "application/hal+json, application/json";

// ETag 얻기: HEAD 시도 -> 안 되면 GET fallback
async function getEtag(url) {
  try {
    const res = await axios.head(url, { headers: { Accept: ACCEPT } });
    return res.headers?.etag ?? null;
  } catch {
    const res = await axios.get(url, { headers: { Accept: ACCEPT } });
    return res.headers?.etag ?? null;
  }
}

// PATCH 우선 -> 405면 PUT으로 fallback
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

      users: [],
      searchQ: "",

      // create 전용
      form: { name: "", email: "", phone: "" },

      // edit 전용
      editing: { url: null },
      editForm: { name: "", email: "", phone: "" },
    };
  },

  computed: {
    canCreate() {
      return this.form.name.trim().length > 0;
    },
    canUpdate() {
      return !!this.editing.url && this.editForm.name.trim().length > 0;
    },
  },

  mounted() {
    this.loadUsers(API.users);
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
    extractUsers(data) {
      return data?._embedded?.users ?? [];
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

    // ---------- list/search ----------
    async loadUsers(url) {
      const res = await this.request("load users", () =>
        axios.get(url, { headers: { Accept: ACCEPT } })
      );
      this.users = this.extractUsers(res.data);
      this.status = `loaded ${this.users.length}`;
    },

    searchUser() {
      const q = this.searchQ.trim();
      if (!q) return this.loadUsers(API.users);
      return this.loadUsers(`${API.search}?q=${encodeURIComponent(q)}`);
    },

    // ---------- create ----------
    async createUser() {
      if (!this.canCreate) return;

      const payload = {
        name: this.form.name.trim(),
        email: this.form.email.trim() || null,
        phone: this.form.phone.trim() || null,
      };

      await this.request("create user", () =>
        axios.post(API.users, payload, {
          headers: { "Content-Type": "application/json" },
        })
      );

      this.form = { name: "", email: "", phone: "" };
      return this.loadUsers(API.users);
    },

    // ---------- edit UI ----------
    startEdit(u) {
      const url = u?._links?.self?.href;
      if (!url) {
        this.setStatus("edit canceled: invalid self link");
        return;
      }

      this.editing.url = url;
      this.editForm = {
        name: (u?.name ?? "").toString(),
        email: (u?.email ?? "").toString(),
        phone: (u?.phone ?? "").toString(),
      };
      this.setStatus(`editing ${this.idFromSelf(u)}`);
    },

    cancelEdit() {
      this.editing.url = null;
      this.editForm = { name: "", email: "", phone: "" };
      this.setStatus("edit canceled");
    },

    // ---------- update ----------
    async updateUser() {
      if (!this.canUpdate) return;

      const url = this.editing.url;

      const payload = {
        name: this.editForm.name.trim(),
        email: this.editForm.email.trim() || null,
        phone: this.editForm.phone.trim() || null,
      };

      try {
        await this.request("update user", async () => {
          const etag = await getEtag(url); // 여기서 404면 request()가 FAILED로 잡음
          const headers = { "Content-Type": "application/json" };
          if (etag) headers["If-Match"] = etag;

          return patchOrPut(url, payload, headers);
        });
      } catch (err) {
        const s = err?.response?.status;

        // 삭제되어 404가 난 경우: edit 폼 닫고 목록 동기화
        if (s === 404) {
          this.setStatus("update failed: already deleted (refreshing list)", this.errInfo(err));
          this.cancelEdit();
          await this.searchUser();
          return;
        }

        // 충돌(누가 먼저 수정/삭제): edit 폼 닫고 목록 동기화
        if (s === 412 || s === 409) {
          this.setStatus("update failed: conflict (refreshing list)", this.errInfo(err));
          this.cancelEdit();
          await this.searchUser();
          return;
        }

        return;
      }

      this.cancelEdit();
      return this.searchUser();
    },

    // ---------- delete ----------
    async deleteUser(u) {
      const ok = window.confirm("Delete User");
      if (!ok) return;

      const url = u?._links?.self?.href;
      if (!url) return;

      try {
        await this.request("delete user", async () => {
          const etag = await getEtag(url);
          const headers = {};
          if (etag) headers["If-Match"] = etag;

          return axios.delete(url, { headers });
        });
      } finally {
        // 삭제한 대상이 현재 편집중이면 편집 종료
        if (this.editing.url === url) this.cancelEdit();
      }

      return this.searchUser();
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
</style>