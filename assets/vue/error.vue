<template>
    <div>
        <section class="section">
            <h2 class="title">Oops...</h2>
            <p>{{ message }}</p>
        </section>
    </div>
</template>

<script>
module.exports = {
    data: function() {
        return {
            title: "Error",
            message: "Unkown error ocurred"
        }
    }
}
</script>
