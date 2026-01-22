<template>
  <div style="padding:16px;">
    <h3>{{ config.title }}</h3>

    <!-- Search -->
    <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end; margin-bottom:12px;">
      <div><input v-model="searchQ" placeholder="name" /></div>
      <button @click="search">검색</button>
    </div>

    <!-- Create -->
    <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:end; margin-bottom:12px;">
      <div v-for="f in config.fields" :key="f.key">
        <input v-model="form[f.key]" :placeholder="f.placeholder ?? f.key" />
      </div>
      <button @click="create" :disabled="!canCreate">생성</button>
    </div>

    <div style="margin:8px 0;">
      <b>Status:</b> {{ status }}
      <span v-if="loading"> (loading...)</span>
    </div>

    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse; width:100%;">
      <thead>
        <tr>
          <th style="width:80px;">ID</th>
          <th v-for="c in config.columns" :key="c.key">{{ c.label }}</th>
          <th style="width:240px;">Actions</th>
        </tr>
      </thead>

      <tbody>
        <tr v-for="u in items" :key="u._links.self.href">
          <td>{{ idFromSelf(u) }}</td>
          <td v-for="c in config.columns" :key="c.key">{{ u[c.key] }}</td>
          <td>
            <button @click="openEdit(u)">Edit</button>
            <button @click="remove(u)">Delete</button>
          </td>
        </tr>

        <tr v-if="items.length === 0">
          <td :colspan="config.columns.length + 2" style="text-align:center; opacity:.7;">
            No {{ config.embeddedKey }}
          </td>
        </tr>
      </tbody>
    </table>

    <pre style="margin-top:12px; background:#f6f6f6; padding:10px;">{{ debug }}</pre>

    <!-- Modal -->
    <div v-if="editModal.open" class="backdrop" @click.self="closeEdit">
      <div class="modal">
        <div class="modal-header">
          <div class="modal-title">Edit {{ config.itemLabel }}</div>
          <button class="x" @click="closeEdit" aria-label="close">✕</button>
        </div>

        <div class="modal-body">
          <div class="row" v-for="f in config.fields" :key="f.key">
            <label>{{ f.label ?? f.key }}</label>
            <input v-model="editModal.form[f.key]" :placeholder="f.placeholder ?? f.key" />
          </div>
        </div>

        <div class="modal-footer">
          <button @click="saveEdit" :disabled="!canSaveEdit">저장</button>
          <button @click="closeEdit">취소</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from "vue";
import { useHalCrud } from "@/composables/useHalCrud.js";

const props = defineProps({
  config: { type: Object, required: true },
});

const {
  loading,
  status,
  debug,
  items,
  searchQ,
  form,
  editModal,
  canCreate,
  canSaveEdit,
  idFromSelf,
  load,
  search,
  create,
  openEdit,
  closeEdit,
  saveEdit,
  remove,
} = useHalCrud(props.config);

onMounted(() => {
  load();
});
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