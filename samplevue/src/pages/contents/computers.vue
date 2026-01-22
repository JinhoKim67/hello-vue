<template>
  <HalCrudPage :config="config" />
</template>

<script setup>
import HalCrudPage from "@/components/HalCrudPage.vue";

const BASE = import.meta.env.VITE_BACKEND;

const config = {
  title: "Computers CRUD",
  itemLabel: "Computer",
  collectionUrl: `${BASE}/computers`,
  searchUrl: `${BASE}/computers/search/findByNameContainingIgnoreCase`,
  embeddedKey: "computers",
  requiredKeys: ["name"],
  fields: [
    { key: "name",  label: "종류", placeholder: "name" },
    { key: "model", label: "모델", placeholder: "model" },
    { key: "spec",  label: "사양", placeholder: "spec" },
  ],
  columns: [
    { key: "name",  label: "종류" },
    { key: "model", label: "모델" },
    { key: "spec",  label: "사양" },
  ],
};
</script>