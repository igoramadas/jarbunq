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
                <a href="/bunq/auth" title="Connect to bunq"><img src="/images/bunq-connect.svg" width="190px"/></a>
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
