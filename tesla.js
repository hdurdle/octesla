var Client = require('node-rest-client').Client;

const config = require('./config.json');

var options = {
    connection: {
        rejectUnauthorized: false,
    }
};

var args = {
    data: {
        username: config.tesla.username,
        password: config.tesla.password,
        email: config.tesla.email,
        force_sm_off: false
    },
    headers: {
        "Content-Type": "application/json"
    }
};

var teslaClient = new Client(options);

teslaClient.registerMethod("login", `https://${config.tesla.ip}/api/login/Basic`, "POST");
teslaClient.registerMethod("updateStatus", `https://${config.tesla.ip}/api/system/update/status`, "GET");

var cookies = []

teslaClient.methods.login(args, function (data, response) {

    cookies = response.headers["set-cookie"]


    // use the cookies we grabbed
    args = {
        headers: {
            "cookie": cookies
        }
    }

    teslaClient.methods.updateStatus(args, function (data, response) {
        console.log(JSON.parse(data.toString()));
    });

});