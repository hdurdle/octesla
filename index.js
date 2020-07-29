const express = require("express");
const moment = require("moment");
const multisort = require("multisort");
const axios = require("axios").default;

const app = express();
app.set("etag", false);
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});

const config = require("./config.json");

const port = config.port;
const apiKey = config.octopus.apiKey;
const MPAN = config.octopus.MPAN;
const meterSerial = config.octopus.meterSerial;

const consumptionURI = `https://api.octopus.energy/v1/electricity-meter-points/${MPAN}/meters/${meterSerial}/consumption/`;

var dataObject = { cheap: [], high: [], low: [] };

//getOctopusData();

// ** Here be functions

app.get("/", async function (req, res) {
  await getOctopusData();
  var ip = req.headers["x-forwarded-for"] || req.connection.remoteAddress;
  var isodate = new Date().toISOString();
  console.log("[" + isodate + "] " + ip);
  res.setHeader("Content-Type", "application/json");
  res.send(dataObject);
});

async function getOctopusData() {
  // var today = moment().subtract(1, "days").startOf("day").add(15, "h");
  // if (moment().hour() >= 16) {
  //   today = moment().startOf("day").add(15, "h");
  // }

  var today = moment(); //.startOf('day').add(15, 'h')

  var ratesQueryURI = `https://api.octopus.energy/v1/products/AGILE-18-02-21/electricity-tariffs/E-1R-AGILE-18-02-21-H/standard-unit-rates/?period_from=${today.format(
    "YYYY-MM-DDTHH:mm"
  )}`;

  await axios
    .get(ratesQueryURI, {
      auth: {
        username: apiKey, // no password, just the apiKey as username
        // see: https://octopus.energy/dashboard/developer/
      },
    })
    .then(function (response) {
      var data = response.data;
      //console.log(data.results)
      var startDateTime = today.format("YYYY-MM-DDTHH:mm");
      //console.log((today))
      var periodsToCheck = data.results.filter((x) =>
        moment(x.valid_from).isAfter(startDateTime)
      );
      var criteria = ["valid_from"];
      multisort(periodsToCheck, criteria);
      var cheapPeriods = periodsToCheck.filter((x) => x.value_inc_vat <= 1);

      // periodsToCheck.forEach(p => {
      //     console.log(`${moment(p.valid_from)} ${p.value_inc_vat}`)
      // });

      console.log(
        `Data from ${periodsToCheck[0].valid_from} to ${
          periodsToCheck[periodsToCheck.length - 1].valid_to
        }.`
      );

      if (cheapPeriods.length > 0) {
        console.log("Cheap/Free Periods:");
        console.log(cheapPeriods);
      }

      var smallestWindow = 4 * 2; // 4 hours = 8 half hour blocks
      var largestWindow = 12 * 2; // hours

      var highest = 0;
      var lowest = 20;
      var highPeriod = [];
      var lowPeriod = [];
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

      dataObject = {
        cheap: cheapPeriods,
        high: getPeriodForJson(highPeriod),
        low: getPeriodForJson(lowPeriod),
      };
    })
    .catch(function (error) {
      console.log(error);
    });
}

function getPeriodForJson(periodObject) {
  var from = moment(periodObject[4]);
  from.local();
  var to = moment(periodObject[5]);
  to.local();

  var newObject = {
    price: periodObject[3],
    from: from.unix(),
    to: to.unix(),
  };

  return newObject;
}

function findMaxMinPeriod(periodsArray, windowSize, findMax = true) {
  var arrayLength = periodsArray.length;
  if (windowSize > arrayLength) windowSize = arrayLength;
  var resultIndex = 0;

  // Compute sum of first subarray of window size
  var currentSum = 0;
  for (i = 0; i < windowSize; i++) {
    currentSum += periodsArray[i].value_inc_vat;
  }
  var maxminSum = currentSum;

  // Traverse from (windowSize+1)'th element to arrayLength'th element
  for (i = windowSize; i < arrayLength; i++) {
    // Add current item and remove first item of previous subarray (sliding the window along)
    currentSum +=
      periodsArray[i].value_inc_vat -
      periodsArray[i - windowSize].value_inc_vat;

    // Update result if needed
    if (findMax) {
      if (currentSum > maxminSum) {
        maxminSum = currentSum;
        resultIndex = i - windowSize + 1;
      }
    } else {
      if (currentSum < maxminSum) {
        maxminSum = currentSum;
        resultIndex = i - windowSize + 1;
      }
    }
  }

  return [
    windowSize,
    resultIndex,
    resultIndex + windowSize - 1,
    maxminSum / windowSize,
    periodsArray[resultIndex].valid_from,
    periodsArray[resultIndex + windowSize - 1].valid_to,
  ];
}

function displayPeriodResults(periodObject) {
  var logString = `Subarray between [${periodObject[1]}, ${periodObject[2]}] has maxmin average: ${periodObject[3]}`;
  console.log(logString);
  logString = `${periodObject[0] / 2} hours from ${moment(
    periodObject[4]
  )} to ${moment(periodObject[5])}.`;
  console.log(logString);
}

app.listen(port, () => console.log(`Now Listening on port ${port}`));
