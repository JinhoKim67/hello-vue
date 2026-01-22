<template>
  <HalCrudPage :config="config" />
</template>

<script setup>
import HalCrudPage from "@/components/HalCrudPage.vue";

const BASE = import.meta.env.VITE_BACKEND;

const config = {
  title: "Users CRUD",
  itemLabel: "User",
  collectionUrl: `${BASE}/users`,
  searchUrl: `${BASE}/users/search/findByNameContainingIgnoreCase`,
  embeddedKey: "users",
  requiredKeys: ["name"],
  fields: [
    { key: "name",  label: "Name",  placeholder: "name" },
    { key: "email", label: "Email", placeholder: "email" },
    { key: "phone", label: "Phone", placeholder: "phone" },
  ],
  columns: [
    { key: "name",  label: "이름" },
    { key: "email", label: "이메일" },
    { key: "phone", label: "전화번호" },
  ],
};
</script>