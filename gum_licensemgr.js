function validateKey(pkey) {
    return new Promise((resolve, reject) => {
        const productID = process.env.NC_GUM_PID || "NC_ASKEY_NOT_SET";

        if (productID === "NC_ASKEY_NOT_SET") {
            console.error("Error: NC_GUM_PID environment variable is not set. Exiting.");
            process.exit(1);
        }

        fetch('https://api.gumroad.com/v2/licenses/verify', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                'product_id': productID,
                'license_key': pkey
            })
        })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    resolve(true);
                } else {
                    resolve(false);
                }
            })
            .catch(error => {
                console.error('Error:', error);
                resolve(false);
            });
    });
}

module.exports = { validateKey };