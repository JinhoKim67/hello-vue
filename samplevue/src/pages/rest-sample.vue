<template>
  <div style="padding:16px;">
    <h3>Users CRUD</h3>

    <!-- Search -->
    <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end; margin-bottom:12px;">
      <div><input v-model="searchQ" placeholder="name" /></div>
      <button @click="searchUser">Search</button>
    </div>

    <!-- Create -->
    <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end; margin-bottom:12px;">
      <div><input v-model="form.name" placeholder="name" /></div>
      <button @click="createUser" :disabled="!canCreate">Create</button>
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

const API = {
  users: "http://localhost:8080/api/users",
  search: "http://localhost:8080/api/users/search/findByNameContainingIgnoreCase",
};

export default {
  data() {
    return {
      loading: false,
      status: "idle",
      debug: "",

      users: [],
      searchQ: "",

      form: { name: "" }, // create 전용
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
      const m = String(href).match(/\/(\d+)(\?.*)?$/);
      return m ? Number(m[1]) : "-";
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
        axios.get(url, { headers: { Accept: "application/hal+json, application/json" } })
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

    // ---------- popup edit (message: "Edit User" only) ----------
    async editUser(u) {
      const oldName = u?.name ?? "";
      const input = window.prompt("Edit User", oldName);

      // cancel
      if (input === null) return;

      const name = input.trim();
      if (!name) {
        this.setStatus("update canceled: empty name");
        return;
      }

      const url = u._links.self.href;

      // PATCH가 405면 PUT으로 변경
      await this.request("update user", () =>
        axios.patch(url, { name }, { headers: { "Content-Type": "application/json" } })
      );

      // 검색 상태 유지하면서 갱신
      return this.searchUser();
    },

    // ---------- delete (message: "Delete User" only) ----------
    async deleteUser(u) {
      const ok = window.confirm("Delete User");
      if (!ok) return;

      const url = u._links.self.href;

      await this.request("delete user", () => axios.delete(url));

      // 검색 상태 유지하면서 갱신
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