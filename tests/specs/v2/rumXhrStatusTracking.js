/* globals describe, it, expect, browser, window, afterEach, fail */

var _ = require('underscore');

describe("RUM status code tracking", function() {

  afterEach(function() {
    browser.reload();
  });

  function payloadsWithoutRaygunApi(payloads) {
    return _.sortBy(_.filter(payloads, function(payload) {
      return payload.url.indexOf('raygun') === -1;
    }), function(payload) { return payload.url; });
  }


  function checkStatusCodes() {
    var requestPayloads = browser.execute(function () {
      return window.__requestPayloads;
    }).value;

    if (requestPayloads.length < 3) {
      fail("test did not wait long enough for ajax requests to be sent to Raygun");
    }

    var timingPayload = payloadsWithoutRaygunApi(JSON.parse(requestPayloads[2].eventData[0].data));

    var expectedPairs = [
      {url: 'http://localhost:4567/fixtures/v2/foo.html', status: 404, type: 'relative url that does not exist'},
      {url: 'http://localhost:4567/fixtures/v2/rumXhrStatusCodes.html', status: 200, type: 'plain relative url'},
      {url: 'http://localhost:4567/fixtures/v2/rumXhrStatusCodes.html', status: 200, type: 'relative url with query string'},
      {url: 'http://localhost:4567/fixtures/v2/rumXhrStatusCodes.html', status: 200, type: 'absolute url'},
    ];

    for (var i = 0;i < expectedPairs.length; i++) {
      var payloadUrl = timingPayload[i].url;
      var payloadStatus = timingPayload[i].status;
      var pairUrl = expectedPairs[i].url;
      var pairStatus = expectedPairs[i].status;
      var pairType = expectedPairs[i].type;

      expect(payloadUrl).toBe(pairUrl, "failed for type: " + pairType);
      expect(payloadStatus).toBe(pairStatus, "failed for type: " + pairType);
    }
  }


  it("attaches the status codes to xhr calls for XmlHttpRequest", function () {
    browser.url('http://localhost:4567/fixtures/v2/rumXhrStatusCodes.html');

    browser.pause(35000);

    checkStatusCodes();
  });

  it("attaches status codes to requests for fetch requests", function() {
    browser.url('http://localhost:4567/fixtures/v2/rumFetchStatusCodes.html');

    browser.pause(1000);

    var supportsFetch = browser.execute(function() {
      return window.supportsFetch;
    }).value;

    if (!supportsFetch) {
      return;
    }

    browser.pause(34000);

    checkStatusCodes();
  });

  it("attaches the status codes for polyfilled fetch requests", function() {
    browser.url('http://localhost:4567/fixtures/v2/rumFetchPolyfillStatusCodes.html');

    browser.pause(35000);

    checkStatusCodes();
  });
});
