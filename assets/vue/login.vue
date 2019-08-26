<template>
    <div>
        <section class="section">
            <p>
                You haven't logged in yet!
            </p>
            <p>
                Please click on the button below to proceed to bunq and authorize the bunq Assistant.
            </p>
            <p>
                <br />
                <a class="button is-primary" href="/auth" title="Authorize the bunq Assistant">Connect to bunq</a>
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
