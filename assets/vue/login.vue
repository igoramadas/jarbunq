<template>
    <div>
        <section class="section">
            <p>
                You haven't logged in yet!
            </p>
            <p>
                Please click on the button below to proceed to bunq and authorize Jarbunq.
            </p>
            <p>
                <br />
                <a class="button is-primary" href="/bunq/auth" title="Authorize Jarbunq">Connect to bunq</a>
            </p>
        </section>
    </div>
</template>

<script>
module.exports = {
    data: function() {
        return {
            title: "Login"
        }
    }
}
</script>
