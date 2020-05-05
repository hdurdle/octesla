const fs = require('fs');
var moment = require('moment');
const request = require('request');
const multisort = require('multisort');

var Client = require('node-rest-client').Client;

const config = require('./config.json');

JSON.dateParser = function (key, value) {
    if (typeof value === 'string') {
        return new Date(value);
    }
    return value;
};

let apiKey = config.octopus.apiKey;
let MPAN = config.octopus.MPAN
let meterSerial = config.octopus.meterSerial

let today = moment().subtract(1, 'days').startOf('day').add(15, 'h')
if (moment().hour() >= 16) {
    today = moment().startOf('day').add(15, 'h')
}

today = moment()

let consumptionURI = "https://api.octopus.energy/v1/electricity-meter-points/" + MPAN + "/meters/" + meterSerial + "/consumption/"
let unitRatesBaseURI = "https://api.octopus.energy/v1/products/AGILE-18-02-21/electricity-tariffs/E-1R-AGILE-18-02-21-H/standard-unit-rates/"
let query = "?period_from=" + today.format('YYYY-MM-DDTHH:mm')
let ratesQueryURI = unitRatesBaseURI + query

getOctopusData()
//teslaTest();


// here be functions

function teslaTest() {

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
    var cookies = []

    var teslaPostURI = `https://${config.tesla.ip}/api/login/Basic`

    teslaClient.post(teslaPostURI, args, function (data, response) {

        cookies = response.headers["set-cookie"]

        // use the cookies we grabbed
        args = {
            headers: {
                "cookie": cookies
            }
        }

        var uri = `https://${config.tesla.ip}/api/system/update/status`

        teslaClient.get(uri, args, function (data, response) {
            console.log(JSON.parse(data.toString()));
        });

    });
}


function getOctopusData() {
    var octopusAuth = {
        user: apiKey
    }; // no password, just the apiKey as username
    // see: https://octopus.energy/dashboard/developer/

    var octopusClient = new Client(octopusAuth);

    octopusClient.get(ratesQueryURI, function (data, response) {

        let startDateTime = today.format('YYYY-MM-DDTHH:mm');
        const periodsToCheck = data.results.filter(x => moment(x.valid_from).isAfter(startDateTime));
        var criteria = ['valid_from'];
        multisort(periodsToCheck, criteria);

        let smallestWindow = 4 * 2 // 4 hours = 8 half hour blocks
        let largestWindow = 12 * 2 // hours

        let highest = 0;
        let lowest = 20;
        let highPeriod = [];
        let lowPeriod = [];
        for (l = smallestWindow; l <= largestWindow; l++) {
            var highestPeriods = findMaxMinPeriod(periodsToCheck, l, true);
            if (highestPeriods[3] > highest) {
                highest = highestPeriods[3];
                highPeriod = highestPeriods;
            }
            var lowestPeriods = findMaxMinPeriod(periodsToCheck, l, false);
            if (lowestPeriods[3] < lowest) {
                lowest = lowestPeriods[3];
                lowPeriod = lowestPeriods;
            }
        }
        console.log("Peak: ");
        displayPeriodResults(highPeriod);
        console.log("Off-Peak: ");
        displayPeriodResults(lowPeriod);
    });
}

function findMaxMinPeriod(periodsArray, windowSize, findMax = true) {

    let arrayLength = periodsArray.length
    if (windowSize > arrayLength) windowSize = arrayLength;
    let resultIndex = 0

    // Compute sum of first subarray of window size
    let currentSum = 0
    for (i = 0; i < windowSize; i++) {
        currentSum += periodsArray[i].value_inc_vat
    }
    let maxminSum = currentSum;

    // Traverse from (windowSize+1)'th element to arrayLength'th element 
    for (i = windowSize; i < arrayLength; i++) {
        // Add current item and remove first item of previous subarray (sliding the window along)
        currentSum += periodsArray[i].value_inc_vat - periodsArray[i - windowSize].value_inc_vat;

        // Update result if needed 
        if (findMax) {
            if (currentSum > maxminSum) {
                maxminSum = currentSum;
                resultIndex = (i - windowSize + 1);
            }
        } else {
            if (currentSum < maxminSum) {
                maxminSum = currentSum;
                resultIndex = (i - windowSize + 1);
            }
        }
    }

    return [windowSize, resultIndex, (resultIndex + windowSize - 1), (maxminSum / windowSize), (periodsArray[resultIndex].valid_from), (periodsArray[resultIndex + windowSize - 1].valid_to)];
}

function displayPeriodResults(periodObject) {

    var logString = `Subarray between [${periodObject[1]}, ${periodObject[2]}] has maxmin average: ${periodObject[3]}`
    console.log(logString)
    logString = `${periodObject[0]/2} hours from ${moment(periodObject[4]).format()} to ${moment(periodObject[5]).format()}.`
    console.log(logString)
}