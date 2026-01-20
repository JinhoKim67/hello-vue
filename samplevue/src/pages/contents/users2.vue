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
      <button @click="createUser" :disabled="!canCreate">생성</button>
    </div>

    <div style="margin:8px 0;">
      <b>Status:</b> {{ status }}
      <span v-if="loading"> (loading...)</span>
    </div>

    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse; width:100%;">
      <thead>
        <tr>
          <th style="width:80px;">ID</th>
          <th>Name</th>
          <th style="width:240px;">Actions</th>
        </tr>
      </thead>

      <tbody>
        <tr v-for="u in users" :key="u._links.self.href">
          <td>{{ idFromSelf(u) }}</td>
          <td>{{ u.name }}</td>
          <td>
            <button @click="editUser(u)">Edit</button>
            <button @click="deleteUser(u)">Delete</button>
          </td>
        </tr>

        <tr v-if="users.length === 0">
          <td colspan="3" style="text-align:center; opacity:.7;">No users</td>
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
const NO_CACHE_HEADERS = {
  Accept: ACCEPT,
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
};

/**
 * 최신 사용자 상태를 서버에서 다시 가져옵니다.
 * - 200: { user, etag }
 * - 404: null 반환 (이미 삭제됨)
 * - 그 외: throw
 */
async function fetchUserFresh(url) {
  try {
    const res = await axios.get(url, { headers: NO_CACHE_HEADERS });
    return {
      user: res.data,
      etag: res.headers?.etag ?? null,
    };
  } catch (e) {
    if (e?.response?.status === 404) return null;
    throw e;
  }
}

/** PATCH 우선 -> 405면 PUT으로 fallback */
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

      form: { name: "" },
    };
  },

  computed: {
    canCreate() {
      return this.form.name.trim().length > 0;
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
      const name = this.form.name.trim();

      await this.request("create user", () =>
        axios.post(API.users, { name }, { headers: { "Content-Type": "application/json" } })
      );

      this.form.name = "";
      return this.loadUsers(API.users);
    },

    // ---------- edit (stateless-friendly) ----------
    async editUser(u) {
      const url = u?._links?.self?.href;
      if (!url) {
        this.setStatus("update canceled: invalid self link");
        return;
      }

      // 1) 수정 직전에 서버에서 최신 리소스를 다시 조회
      let fresh;
      try {
        fresh = await fetchUserFresh(url);
      } catch (err) {
        this.setStatus("fetch user before update FAILED", this.errInfo(err));
        return;
      }

      // 이미 삭제된 경우(다른 탭/클라이언트가 삭제)
      if (fresh === null) {
        this.setStatus("update skipped: user already deleted (refreshing list)");
        await this.searchUser();
        return;
      }

      const oldName = fresh.user?.name ?? "";
      const input = window.prompt("Edit User", oldName);
      if (input === null) return;

      const name = input.trim();
      if (!name) {
        this.setStatus("update canceled: empty name");
        return;
      }

      // 2) ETag 기반 조건부 수정(If-Match)
      try {
        await this.request("update user", async () => {
          const headers = { "Content-Type": "application/json" };
          if (fresh.etag) headers["If-Match"] = fresh.etag;

          return patchOrPut(url, { name }, headers);
        });
      } catch (err) {
        const s = err?.response?.status;

        // 404: 그 사이 삭제됨
        if (s === 404) {
          this.setStatus("update failed: user was deleted (refreshing list)", this.errInfo(err));
          await this.searchUser();
          return;
        }

        // 412/409: 그 사이 누군가 수정/삭제(ETag 충돌 포함)
        if (s === 412 || s === 409) {
          this.setStatus("update failed: conflict (someone changed it) (refreshing list)", this.errInfo(err));
          await this.searchUser();
          return;
        }

        // 그 외는 request()가 이미 debug 찍음
        return;
      }

      return this.searchUser();
    },

    // ---------- delete (stateless-friendly, idempotent-ish) ----------
    async deleteUser(u) {
      const ok = window.confirm("Delete User");
      if (!ok) return;

      const url = u?._links?.self?.href;
      if (!url) {
        this.setStatus("delete canceled: invalid self link");
        return;
      }

      // 1) 삭제 직전에 서버에서 최신 리소스를 다시 조회
      let fresh;
      try {
        fresh = await fetchUserFresh(url);
      } catch (err) {
        this.setStatus("fetch user before delete FAILED", this.errInfo(err));
        return;
      }

      // 이미 삭제된 경우: REST 관점에서 DELETE는 멱등이라 “이미 없음”을 성공 취급하고 목록만 갱신
      if (fresh === null) {
        this.setStatus("delete skipped: already deleted (refreshing list)");
        await this.searchUser();
        return;
      }

      // 2) ETag 기반 조건부 삭제(If-Match)
      try {
        await this.request("delete user", async () => {
          const headers = {};
          if (fresh.etag) headers["If-Match"] = fresh.etag;

          return axios.delete(url, { headers });
        });
      } catch (err) {
        const s = err?.response?.status;

        // 404: 그 사이 삭제됨 -> 성공 취급 후 목록 갱신
        if (s === 404) {
          this.setStatus("delete treated as success: already deleted (refreshing list)", this.errInfo(err));
          await this.searchUser();
          return;
        }

        // 412/409: 누군가 먼저 변경/삭제
        if (s === 412 || s === 409) {
          this.setStatus("delete failed: conflict (someone changed it) (refreshing list)", this.errInfo(err));
          await this.searchUser();
          return;
        }

        return;
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