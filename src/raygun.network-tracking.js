/**
 * @prettier
 */

/*
 * raygun4js
 * https://github.com/MindscapeHQ/raygun4js
 *
 * Copyright (c) 2017 MindscapeHQ
 * Licensed under the MIT license.
 */

window.raygunNetworkTrackingFactory = function(window, Raygun) {
  var NetworkTracking = function() {
    this.requestHandlers = [];
    this.responseHandlers = [];
    this.errorHandlers = [];

    this.wrapWithHandler = function(method) {
      return function() {
        try {
          return method.apply(this, arguments);
        } catch (ex) {
          Raygun.Utilities.log(ex);
        }
      };
    };

    this.executeHandlers = this.wrapWithHandler(function(handlers, data) {
      for (var i = 0; i < handlers.length; i++) {
        handlers[i](JSON.parse(JSON.stringify(data)));
      }
    });

    this.wrapPrototypeWithHandlers();

    this.attach();
  };

  NetworkTracking.prototype.on = function(type, handler) {
    switch (type) {
      case 'request':
        this.requestHandlers.push(handler);
        break;
      case 'response':
        this.responseHandlers.push(handler);
        break;
      case 'error':
        this.errorHandlers.push(handler);
        break;
    }
  };

  NetworkTracking.prototype.off = function(type, handler) {
    switch (type) {
      case 'request':
        this.requestHandlers = Raygun.Utilities.removeFromArray(this.requestHandlers, handler);
        break;
      case 'response':
        this.responseHandlers = Raygun.Utilities.removeFromArray(this.responseHandlers, handler);
        break;
      case 'error':
        this.errorHandlers = Raygun.Utilities.removeFromArray(this.errorHandlers, handler);
        break;
    }
  };

  NetworkTracking.prototype.attach = function() {
    var self = this;

    if (window.XMLHttpRequest.prototype.addEventListener) {
      Raygun.Utilities.enhance(
        window.XMLHttpRequest.prototype,
        'open',
        self.wrapWithHandler(function() {
          var initTime = new Date().getTime();
          var url = Raygun.Utilities.resolveFullUrl(arguments[1]) || 'Unknown';
          var baseUrl = url.split('?')[0];
          var method = arguments[0];

          Raygun.Utilities.enhance(
            this,
            'send',
            self.wrapWithHandler(function() {
              var metadata = {
                method: method,
                requestURL: url,
                baseUrl: baseUrl,
              };

              if (arguments[0] && typeof arguments[0] === 'string') {
                metadata.body = arguments[0];
              }

              self.executeHandlers(self.requestHandlers, metadata);
            })
          );

          this.addEventListener(
            'load',
            self.wrapWithHandler(function() {
              var body = 'N/A for non text responses';

              if (this.responseType === '' || this.responseType === 'text') {
                body = this.responseText;
              }

              Raygun.Utilities.log('tracking xhr response for', url);
              self.executeHandlers(self.responseHandlers, {
                status: this.status,
                requestURL: url,
                responseURL: this.responseURL,
                baseUrl: baseUrl,
                body: body,
                duration: new Date().getTime() - initTime,
              });
            })
          );

          this.addEventListener(
            'error',
            self.wrapWithHandler(function() {
              self.executeHandlers(self.errorHandlers, {
                requestURL: url,
                responseURL: this.responseURL,
                duration: new Date().getTime() - initTime,
              });
            })
          );
        })
      );
    }

    var disableFetchLogging = function() {};
    // If fetch has been polyfilled we don't want to hook into it as it then uses XMLHttpRequest
    // This results in doubled up breadcrumbs
    // Can't reliably detect when it has been polyfilled but no IE version supports fetch
    // So if this is IE, don't hook into fetch
    if (typeof window.fetch === 'function' && typeof window.fetch.polyfill === 'undefined' && !Raygun.Utilities.isIE()) {
      var originalFetch = window.fetch;
      window.fetch = function() {
        var fetchInput = arguments[0];
        var url, baseUrl;
        var options = arguments[1];
        var method = (options && options.method) || 'GET';
        var initTime = new Date().getTime();

        if (typeof fetchInput === 'string') {
          url = fetchInput;
        } else if (typeof window.Request !== 'undefined' && fetchInput instanceof window.Request) {
          url = fetchInput.url;

          if (fetchInput.method) {
            method = fetchInput.method;
          }
        } else {
          url = String(fetchInput);
        }
        url = Raygun.Utilities.resolveFullUrl(url);
        baseUrl = url.split('?')[0];

        var promise = originalFetch.apply(null, arguments);

        try {
          var metadata = {
            method: method,
            requestURL: url,
            baseUrl: baseUrl,
          };

          if (options && options.body) {
            metadata.body = options.body;
          }

          self.executeHandlers(self.requestHandlers, metadata);

          promise.then(
            self.wrapWithHandler(function(response) {
              var body = 'N/A when the fetch response does not support clone()';
              var ourResponse = typeof response.clone === 'function' ? response.clone() : undefined;

              function executeHandlers() {
                Raygun.Utilities.log('tracking fetch response for', url);
                self.executeHandlers(self.responseHandlers, {
                  status: response.status,
                  requestURL: url,
                  responseURL: response.url,
                  body: body,
                  baseUrl: baseUrl,
                  duration: new Date().getTime() - initTime,
                });
              }

              if (ourResponse) {
                ourResponse.text().then(function(text) {
                  body = Raygun.Utilities.truncate(text, 500);

                  executeHandlers();
                });
              } else {
                executeHandlers();
              }
            })
          );

          promise.catch(
            self.wrapWithHandler(function(error) {
              self.executeHandlers(self.errorHandlers, {
                metadata: {
                  requestUrl: url,
                  error: error.toString(),
                  duration: new Date().getTime() - initTime,
                },
              });
            })
          );
        } catch (e) {
          Raygun.Utilities.log(e);
        }

        return promise;
      };

      disableFetchLogging = function() {
        window.fetch = originalFetch;
      };
    }
  };

  NetworkTracking.prototype.wrapPrototypeWithHandlers = function() {
    var name, method;
    for (name in NetworkTracking.prototype) {
      method = NetworkTracking.prototype[name];
      if (typeof method === 'function') {
        NetworkTracking.prototype[name] = this.wrapWithHandler(method);
      }
    }
  };

  return new NetworkTracking();
};
