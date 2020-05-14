const axios = require('axios').default;
const https = require('https');

const trustyAxios = axios.create({
    httpsAgent: new https.Agent({
        rejectUnauthorized: false
    })
});

const config = require('./config.json');

var args = {
    username: config.tesla.username,
    password: config.tesla.password,
    email: config.tesla.email,
    force_sm_off: false
};

var updateStatusURI = `https://${config.tesla.ip}/api/system/update/status`

var cookies = []

trustyAxios.post(`https://${config.tesla.ip}/api/login/Basic`, args)
    .then(function (response) {

        console.log(response)

        cookies = response.headers["set-cookie"]
        args = {
            headers: {
                "cookie": cookies
            }
        }

        trustyAxios.get(updateStatusURI, args)
            .then(function (resp) {
                console.log(resp)
            }).catch(function (error) {
                console.log(error);
            });

    })
    .catch(function (error) {
        console.log(error);
    });