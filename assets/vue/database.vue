<template>
    <div>
        <section class="section">
            <h2 class="title">Database</h2>
            <textarea v-model="jsonData"></textarea>
        </section>
    </div>
</template>

<script>
module.exports = {
    data: function() {
        return {
            title: "Error",
            jsonData: null
        }
    }
}
</script>
