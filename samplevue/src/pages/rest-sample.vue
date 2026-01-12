<template>
    <div>
        <v-btn @click="click1">Click Me</v-btn>
        <pre>{{ data1 }}</pre>
        <pre>{{ data2 }}</pre>
        <table>
            <tr v-for="user in users" :key="user.id">
                <td>{{ user.id }}</td>
                <td>{{ user.name }}</td>
            </tr>
        </table>
    </div>
</template>

<script>
import axios from 'axios';

export default {
    data() {
        return {
            data1: 'This is study1 page data',
            data2: 42,
            users: []
        }
    },

    // 파일 최초 로드시 호출
    mounted() {
        console.log('study1 mounted');
        console.log(axios);
    },

    methods: {
        click1() {
            console.log('click1 method called');
            this.data1 = new Date();
            axios(
                {
                    method: 'get',
                    url: 'http://localhost:8080/api/users'
                }
            )
                .then(response => {
                    // this.users = response.data;
                    this.users=response.data._embedded.users;
                    console.log(response);
                })
                .catch(error => {
                    console.error('Error fetching users:', error);
                });
        }
    }
}
</script>

<style></style>