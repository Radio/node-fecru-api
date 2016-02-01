/**
 * Fisheye Crucible REST API Client.
 *
 * @author Max Gopey <mgopey@gmail.com>
 * @license MIT
 */
var url = require('url');
var querystring = require('querystring');

var UserPreferenceKeys = {
    // todo: find and describe known keys.
};

var RecentlyVisitedItems = {
    reviews: 'reviews',
    snippets: 'snippets',
    repositories: 'repositories',
    users: 'users',
    projects: 'projects'
};

var ReviewStates = {
    draft: 'Draft',
    approval: 'Approval',
    review: 'Review',
    summarize: 'Summarize',
    closed: 'Closed',
    dead: 'Dead',
    rejected: 'Rejected',
    unknown: 'Unknown'
};

var ReviewsFilters = {
    allReviews: 'allReviews',
    allOpenReviews: 'allOpenReviews',
    allClosedReviews: 'allClosedReviews',
    draftReviews: 'draftReviews',
    toReview: 'toReview',
    requireMyApproval: 'requireMyApproval',
    toSummarize: 'toSummarize',
    outForReview: 'outForReview',
    drafts: 'drafts',
    open: 'open',
    closed: 'closed',
    trash: 'trash'
};

var FecruApiClient = function (serviceUrl, username, password, apiToken, apiVersion) {
    this.serviceUrl = serviceUrl;
    this.urlOptions = url.parse(serviceUrl);

    this.username = username;
    this.password = password;
    this.apiVersion = apiVersion || '1.0';
    this.apiToken = apiToken;
    this.strictSSL = true;
    this.useDeprecated = false;

    var request = require('request');

    var userToken;

    var apiPath = '/rest/api';
    var servicePathsMap = {
        fe: '/rest-service-fe',
        cru: '/rest-service',
        fecru: '/rest-service-fecru'
    };

    this.makeUri = function(service, pathname, queryParams) {
        if (userToken) {
            queryParams = queryParams || {};
            queryParams.FEAUTH = userToken;
        }
        if (queryParams !== undefined && queryParams !== null) {
            pathname += (pathname.indexOf('?') >= 0 ? '&' : '?') +
                querystring.stringify(queryParams);
        }
        var uri = url.format({
            protocol: this.urlOptions.protocol,
            hostname: this.urlOptions.hostname,
            port: this.urlOptions.port,
            pathname: apiPath + '/' + this.apiVersion + servicePathsMap[service] + pathname
        });
        return decodeURIComponent(uri);
    };

    this.request = function(options, callback) {

        options.rejectUnauthorized = this.strictSSL;

        options.headers = options.headers || {};
        options.headers.Accept = 'application/json';

        console.log('Requesting:', options);
        request(options, callback);
    };
    this.get = function(url, callback) {
        this.request({method: 'GET', uri: url}, callback);
    };
    this.delete = function(url, callback) {
        this.request({method: 'DELETE', uri: url}, callback);
    };
    this.post = function(url, data, callback) {
        this.request({method: 'POST', uri: url, json: true, body: data}, callback);
    };
    this.put = function(url, data, callback) {
        this.request({method: 'PUT', uri: url, json: true, body: data}, callback);
    };

    this.setStrictSSL = function(strictSSL) {
        this.strictSSL = !!strictSSL;
    };

    this.setUserToken = function(token) {
        userToken = token;
    };

    this.setUseDeprecated = function(useDeprecated) {
        this.useDeprecated = useDeprecated;
    };
};

(function() {

    /**
     * Create the API response handler.
     *
     * @param {Function} callback
     */
    function responseHandleFactory(callback) {
        /**
         * Handle the API response.
         *
         * @param {Error|String} error
         * @param {Object|String} response
         * @param {String} error
         */
        return function(error, response, body) {

            var newError;
            if (error) {
                callback(error, null);
                return;
            }

            if (response.statusCode === 404) {
                newError = new Error('Resource not found.');
                newError.status = 404;
                callback(newError);
                return;
            }

            if ([200, 201, 202, 203, 204].indexOf(response.statusCode) === -1) {
                newError = new Error(response.statusCode + ': Unable to connect to Fecru.');
                newError.status = response.statusCode;
                callback(newError);
                return;
            }

            if (response.statusCode === 200) {
                body = typeof body == 'object' ? body : JSON.parse(body);
            } else {
                body = null;
            }
            callback(null, body);
        };
    }

    /**
     * Get the user authentication token.
     * @url https://docs.atlassian.com/fisheye-crucible/latest/wadl/fecru.html#rest-service-fecru:auth
     *
     * @param {String|Function} username
     * @param {String} password
     * @param {Function} callback
     */
    this.getToken = function(username, password, callback) {
        if (this.useDeprecated) {
            this.getTokenDeprecated(username, password, callback);
            return;
        }

        if (typeof username == 'function') {
            callback = username;
        } else {
            this.username = username || this.username;
            this.password = password || this.password;
        }

        var authParams = {
            userName: this.username,
            password: this.password
        };

        this.post(this.makeUri('fecru', '/auth/login'), authParams, (function(client) {
            return function(error, response, body) {
                if (response && response.statusCode === 404) {
                    client.setUseDeprecated(true);
                    client.getTokenDeprecated(username, password, callback, true);
                    return;
                }
                responseHandleFactory(callback)(error, response, body);
            };
        })(this));
    };

    /**
     * Get the user authentication token.
     * @url https://docs.atlassian.com/fisheye-crucible/latest/wadl/crucible.html#rest-service:auth-v1
     *
     * @deprecated since FishEye 3.5.0 for removal in 4.0.
     * @see authorize()
     *
     * @param {String|Function} username
     * @param {String} password
     * @param {Function} callback
     * @param {Boolean} tryDeprecated
     */
    this.getTokenDeprecated = function(username, password, callback, tryDeprecated) {
        if (typeof username == 'function') {
            callback = username;
        } else {
            this.username = username || this.username;
            this.password = password || this.password;
        }

        var authParams = {
            userName: this.username,
            password: this.password
        };
        var options = {
            method: 'POST',
            uri: this.makeUri('cru', '/auth-v1/login'),
            body: querystring.stringify(authParams),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        };

        this.request(options, (function(client) {
            return function(error, response, body) {
                if (tryDeprecated && response && response.statusCode === 404) {
                    client.setUseDeprecated(false);
                }
                responseHandleFactory(callback)(error, response, body);
            };
        })(this));
    };

    /**
     * Retrieve the user authentication token and store it to pass with further requests.
     *
     * @param {String} username
     * @param {String} password
     * @param {Function} callback
     */
    this.authorize = function(username, password, callback) {
        this.getToken(username, password, (function(client) {
            return function(err, result) {
                if (result && result.token) {
                    client.setUserToken(result.token);
                }
                callback(err, result);
            };
        })(this));
    };

    /**
     * Get general information about the server's configuration.
     * @url https://docs.atlassian.com/fisheye-crucible/latest/wadl/fecru.html#rest-service-fecru:server-v1
     *
     * @param {Function} callback
     */
    this.getServerInfo = function(callback) {
        this.get(this.makeUri('fecru', '/server-v1'), responseHandleFactory(callback));
    };

    /**
     * Get user's global preference.
     * @url https://docs.atlassian.com/fisheye-crucible/latest/wadl/fecru.html#rest-service-fecru:user-prefs-v1:property
     *
     * @param {string} property
     * @param {Function} callback
     */
    this.getUserPreference = function(property, callback) {
        this.get(this.makeUri('fecru', '/user-prefs-v1/' + property), responseHandleFactory(callback));
    };

    /**
     * Get user's preference related to a certain repository.
     * @url https://docs.atlassian.com/fisheye-crucible/latest/wadl/fecru.html#rest-service-fecru:user-prefs-v1:repo:property
     *
     * @param {string} repo
     * @param {string} property
     * @param {Function} callback
     */
    this.getUserRepoPreference = function(repo, property, callback) {
        this.get(this.makeUri('fecru', '/user-prefs-v1/' + repo + '/' + property), responseHandleFactory(callback));
    };

    /**
     * Set a user preference. If repo is not set, the preference will be recognised as a global preference.
     * @uri https://docs.atlassian.com/fisheye-crucible/latest/wadl/fecru.html#rest-service-fecru:user-prefs-v1
     *
     * @param {String} property
     * @param {String} value
     * @param {Function} callback
     */
    this.setUserPreference = function(property, value, callback) {
        console.log('This method is not implemented yet due to lack of documentation. The request will not be sent.');
        //var postBody = {
            // todo: find the body structure.
        //};
        //this.post(this.makeUri('fecru', '/user-prefs-v1'), postBody, responseHandleFactory(callback));
    };

    /**
     * Get a list of recently visited items for the currently logged in user.
     * @uri https://docs.atlassian.com/fisheye-crucible/latest/wadl/fecru.html#rest-service-fecru:recently-visited-v1
     *
     * @param {String} item Optional item key. See RecentlyVisitedItems for available values.
     * @param {Boolean} detailed If true then detailed entities will be included
     * @param {Function} callback
     */
    this.getRecentlyVisitedItems = function(item, detailed, callback) {
        var resourcePath = '/recently-visited-v1';
        if (item) {
            resourcePath += '/' + item;
        }
        if (detailed) {
            resourcePath += '/detailed';
        }
        this.get(this.makeUri('fecru', resourcePath), responseHandleFactory(callback));
    };

    /**
     * Get a repository indexing status.
     * @uri https://docs.atlassian.com/fisheye-crucible/latest/wadl/fecru.html#rest-service-fecru:indexing-status-v1
     *
     * @param {String} repository
     * @param {Function} callback
     */
    this.getIndexingStatus = function(repository, callback) {
        this.get(this.makeUri('fecru', '/indexing-status-v1/status/' + repository), responseHandleFactory(callback));
    };

    /**
     * Share content.
     * @uri https://docs.atlassian.com/fisheye-crucible/latest/wadl/fecru.html#rest-service-fecru:share-content-v1
     *
     * @param {Object} content
     * @param {Function} callback
     */
    this.shareContent = function(content, callback) {
        this.post(this.makeUri('fecru', '/share-content-v1/share'), content, responseHandleFactory(callback));
    };

    /**
     * Get a list of all repositories.
     * @uri https://docs.atlassian.com/fisheye-crucible/latest/wadl/crucible.html#rest-service:repositories-v1
     *
     * @param {Object} filter
     * @param {Function} callback
     */
    this.getRepositories = function(filter, callback) {
        this.get(this.makeUri('cru', '/repositories-v1?' + querystring.stringify(filter)),
            responseHandleFactory(callback));
    };

    /**
     * Get the details of the repository with the specified name.
     * @uri https://docs.atlassian.com/fisheye-crucible/latest/wadl/crucible.html#rest-service:repositories-v1:name
     *
     * @param {String} name
     * @param {Function} callback
     */
    this.getRepository = function(name, callback) {
        this.get(this.makeUri('cru', '/repositories-v1/' + name), responseHandleFactory(callback));
    };

    /**
     * Lists the contents of the specified directory.
     * @uri https://docs.atlassian.com/fisheye-crucible/latest/wadl/crucible.html#rest-service:repositories-v1:browse:repo:path:.*$
     *
     * @param {String} repo Name of the Crucible SCM plugin repository.
     * @param {String} path Path to a directory, i.e.: trunk/src, dev/build
     * @param {Function} callback
     */
    this.browseRepository = function(repo, path, callback) {
        this.get(this.makeUri('cru', '/repositories-v1/browse/' + repo + '/' + path), responseHandleFactory(callback));
    };

    /**
     * Get the details of a versioned entity (file or directory).
     * @uri https://docs.atlassian.com/fisheye-crucible/latest/wadl/crucible.html#rest-service:repositories-v1:repo:revision:path:.*$
     *
     * @param {String} repo
     * @param {String} revision
     * @param {String} path
     * @param {Function} callback
     */
    this.getRepositoryItemDetails = function(repo, revision, path, callback) {
        this.get(this.makeUri('cru', '/repositories-v1/' + repo + '/' + revision + '/' + path),
            responseHandleFactory(callback));
    };

    /**
     * Get a sorted list of changesets, newest first.
     * @uri https://docs.atlassian.com/fisheye-crucible/latest/wadl/crucible.html#rest-service:repositories-v1:history:repo:revision:path:.*$
     *
     * @param {String} repo
     * @param {String} revision
     * @param {String} path
     * @param {Function} callback
     */
    this.getRepositoryItemHistory = function(repo, revision, path, callback) {
        this.get(this.makeUri('cru', '/repositories-v1/history/' + repo + '/' + revision + '/' + path),
            responseHandleFactory(callback));
    };

    /**
     * Get the raw content of the specified file revision as a binary stream.
     * @uri https://docs.atlassian.com/fisheye-crucible/latest/wadl/crucible.html#rest-service:repositories-v1:content:repo:revision:path:.*$
     *
     * @param {String} repo
     * @param {String} revision
     * @param {String} path
     * @param {Function} callback
     */
    this.getRepositoryFileContent = function(repo, revision, path, callback) {
        this.get(this.makeUri('cru', '/repositories-v1/content/' + repo + '/' + revision + '/' + path),
            responseHandleFactory(callback));
    };

    /**
     * Get a sorted list of changesets, newest first.
     * @uri https://docs.atlassian.com/fisheye-crucible/latest/wadl/crucible.html#rest-service:repositories-v1:change:repo:revision
     *
     * @param {String} repo
     * @param {String} path
     * @param {Object} filter
     * @param {Function} callback
     */
    this.getRepositoryChangesets = function(repo, path, filter, callback) {
        this.get(this.makeUri('cru', '/repositories-v1/changes/' + repo + '/' + path +
            '?' + querystring.stringify(filter)), responseHandleFactory(callback));
    };

    /**
     * Get the particular changeset.
     * @uri https://docs.atlassian.com/fisheye-crucible/latest/wadl/crucible.html#rest-service:repositories-v1:change:repo:revision
     *
     * @param {String} repo
     * @param {String} revision
     * @param {Function} callback
     */
    this.getRepositoryChangeset = function(repo, revision, callback) {
        this.get(this.makeUri('cru', '/repositories-v1/change/' + repo + '/' + revision),
            responseHandleFactory(callback));
    };

    /**
     * Get a list of all the groups.
     * @uri https://docs.atlassian.com/fisheye-crucible/latest/wadl/crucible.html#rest-service:groups-v1
     *
     * @param {Function} callback
     */
    this.getGroups = function(callback) {
        this.get(this.makeUri('cru', '/groups-v1'), responseHandleFactory(callback));
    };

    /**
     * Get Crucible version information.
     * @uri https://docs.atlassian.com/fisheye-crucible/latest/wadl/crucible.html#rest-service:reviews-v1:versionInfo
     *
     * @param {Function} callback
     */
    this.getVersionInfo = function(callback) {
        this.get(this.makeUri('cru', '/reviews-v1/versionInfo'), responseHandleFactory(callback));
    };

    /**
     * Get comment metrics metadata for the specified metrics version.
     * @uri https://docs.atlassian.com/fisheye-crucible/latest/wadl/crucible.html#rest-service:reviews-v1:metrics:version
     *
     * @param {String} versionId
     * @param {Function} callback
     */
    this.getCommentMetrics = function(versionId, callback) {
        this.get(this.makeUri('cru', '/reviews-v1/metrics/' + versionId), responseHandleFactory(callback));
    };

    /**
     * Get a list of Reviews which include a particular file.
     * @uri https://docs.atlassian.com/fisheye-crucible/latest/wadl/crucible.html#rest-service:reviews-v1:search:repository
     * @uri https://docs.atlassian.com/fisheye-crucible/latest/wadl/crucible.html#rest-service:reviews-v1:search:repository:details
     *
     * @param {String} repo
     * @param {String} path
     * @param {Boolean} detailed
     * @param {Function} callback
     */
    this.searchReviewsByFile = function(repo, path, detailed, callback) {
        this.get(this.makeUri('cru', '/reviews-v1/search/' + repo + (detailed ? '/details' : '') + '?path=' + path),
            responseHandleFactory(callback));
    };

    /**
     * Get all reviews as a list of ReviewData structures.
     * @uri https://docs.atlassian.com/fisheye-crucible/latest/wadl/crucible.html#rest-service:reviews-v1
     * @uri https://docs.atlassian.com/fisheye-crucible/latest/wadl/crucible.html#rest-service:reviews-v1:details
     *
     * @param {Array} states
     * @param {Boolean} detailed
     * @param {Function} callback
     */
    this.getAllReviews = function(states, detailed, callback) {
        var resourcePath = '/reviews-v1';
        if (detailed) {
            resourcePath += '/details';
        }
        if (states && states.length) {
            resourcePath += '?states=' + querystring.stringify(states);
        }
        this.get(this.makeUri('cru', resourcePath), responseHandleFactory(callback));
    };


    /**
     * Gets a list of all the reviews that match the specified filter criteria.
     * @uri https://docs.atlassian.com/fisheye-crucible/latest/wadl/crucible.html#rest-service:reviews-v1:filter
     * @uri https://docs.atlassian.com/fisheye-crucible/latest/wadl/crucible.html#rest-service:reviews-v1:filter:details
     * @uri https://docs.atlassian.com/fisheye-crucible/latest/wadl/crucible.html#rest-service:reviews-v1:filter:filter
     * @uri https://docs.atlassian.com/fisheye-crucible/latest/wadl/crucible.html#rest-service:reviews-v1:filter:filter:details
     *
     * @param {Object|String} filter A filter name or a filter object.
     * @param {Boolean} detailed
     * @param {Function} callback
     */
    this.filterReviews = function(filter, detailed, callback) {
        var resourcePath = '/reviews-v1/filter';
        if (typeof filter == 'string') {
            resourcePath += '/' + filter;
        }
        if (detailed) {
            resourcePath += '/details';
        }
        if (typeof filter == 'object') {
            resourcePath += '?' + querystring.stringify(filter);
        }
        this.get(this.makeUri('cru', resourcePath), responseHandleFactory(callback));
    };

    /**
     * Get a single review by its permId (e.g. "CR-45").
     * @uri https://docs.atlassian.com/fisheye-crucible/latest/wadl/crucible.html#rest-service:reviews-v1:id
     * @uri https://docs.atlassian.com/fisheye-crucible/latest/wadl/crucible.html#rest-service:reviews-v1:id:details
     *
     * @param {String} reviewId
     * @param {Boolean} detailed
     * @param {Function} callback
     */
    this.getReview = function(reviewId, detailed, callback) {
        var resourcePath = '/reviews-v1/' + reviewId;
        if (detailed) {
            resourcePath += '/details';
        }
        this.get(this.makeUri('cru', resourcePath), responseHandleFactory(callback));
    };

    /**
     * Get a list of the actions which the current user is allowed to perform on the review.
     * @uri https://docs.atlassian.com/fisheye-crucible/latest/wadl/crucible.html#rest-service:reviews-v1:id:actions
     *
     * @param {String} reviewId
     * @param {Function} callback
     */
    this.getReviewActions = function(reviewId, callback) {
        this.get(this.makeUri('cru', '/reviews-v1/' + reviewId + '/actions'), responseHandleFactory(callback));
    };

    /**
     * Get a list of the actions which the current user can perform on this review,
     * given its current state and the user's permissions.
     * @uri https://docs.atlassian.com/fisheye-crucible/latest/wadl/crucible.html#rest-service:reviews-v1:id:transitions
     *
     * @param {String} reviewId
     * @param {Function} callback
     */
    this.getReviewActions = function(reviewId, callback) {
        this.get(this.makeUri('cru', '/reviews-v1/' + reviewId + '/transitions'),
            responseHandleFactory(callback));
    };

    /**
     * Get a list of reviewers in the review given by the permaid id.
     * @uri https://docs.atlassian.com/fisheye-crucible/latest/wadl/crucible.html#rest-service:reviews-v1:id:reviewers
     *
     * @param {String} reviewId
     * @param {Bool|Function} completed Optional. Could be skipped. If function is passed it is treated as a callback.
     * @param {Function} callback
     */
    this.getReviewReviewers = function(reviewId, completed, callback) {
        if (typeof completed == 'function') {
            callback = completed;
            completed = null;
        }
        var resourcePath = '/reviews-v1/' + reviewId + '/reviewers';
        if (typeof completed === 'boolean') {
            resourcePath += completed ? 'completed' : 'uncompleted';
        }
        this.get(this.makeUri('cru', resourcePath), responseHandleFactory(callback));
    };

    /**
     * Get a list of all the items in a review.
     * @uri https://docs.atlassian.com/fisheye-crucible/latest/wadl/crucible.html#rest-service:reviews-v1:id:reviewitems
     *
     * @param {String} reviewId
     * @param {Function} callback
     */
    this.getReviewItems = function(reviewId, callback) {
        this.get(this.makeUri('cru', '/reviews-v1/' + reviewId + '/reviewitems'),
            responseHandleFactory(callback));
    };

    /**
     * Get detailed information for a specific review item.
     * @uri https://docs.atlassian.com/fisheye-crucible/latest/wadl/crucible.html#rest-service:reviews-v1:id:reviewitems:riId
     *
     * @param {String} reviewId
     * @param {String} itemId
     * @param {Function} callback
     */
    this.getReviewItemDetails = function(reviewId, itemId, callback) {
        this.get(this.makeUri('cru', '/reviews-v1/' + reviewId + '/reviewitems/' + itemId),
            responseHandleFactory(callback));
    };

    /**
     * Get comments visible to the requesting user for the item.
     * @uri https://docs.atlassian.com/fisheye-crucible/latest/wadl/crucible.html#rest-service:reviews-v1:id:comments
     *
     * @param {String} reviewId
     * @param {String} itemId
     * @param {Boolean} render
     * @param {Function} callback
     */
    this.getReviewItemComments = function(reviewId, itemId, render, callback) {
        this.get(this.makeUri('cru', '/reviews-v1/' + reviewId + '/reviewitems/' + itemId + '/comments' +
            (render ? '?render=true' : '')), responseHandleFactory(callback));
    };

    /**
     * Get a list of patches and their details for the given review.
     * @uri https://docs.atlassian.com/fisheye-crucible/latest/wadl/crucible.html#rest-service:reviews-v1:id:patch
     *
     * @param {String} reviewId
     * @param {Function} callback
     */
    this.getReviewPatches = function(reviewId, callback) {
        this.get(this.makeUri('cru', '/reviews-v1/' + reviewId + '/patch'), responseHandleFactory(callback));
    };

    /**
     * Get all the comments visible to the requesting user for the review.
     * @uri https://docs.atlassian.com/fisheye-crucible/latest/wadl/crucible.html#rest-service:reviews-v1:id:comments
     *
     * @param {String} reviewId
     * @param {Function} callback
     */
    this.getReviewComments = function(reviewId, callback) {
        this.get(this.makeUri('cru', '/reviews-v1/' + reviewId + '/comments'), responseHandleFactory(callback));
    };

    /**
     * Get all the comments visible to the requesting user for the review.
     * @uri https://docs.atlassian.com/fisheye-crucible/latest/wadl/crucible.html#rest-service:reviews-v1:id:comments
     *
     * @param {String} reviewId
     * @param {Boolean} render
     * @param {Function} callback
     */
    this.getReviewComments = function(reviewId, render, callback) {
        this.get(this.makeUri('cru', '/reviews-v1/' + reviewId + '/comments' + (render ? '?render=true' : '')),
            responseHandleFactory(callback));
    };

    /**
     * Get all general comments visible to the requesting user for the review.
     * @uri https://docs.atlassian.com/fisheye-crucible/latest/wadl/crucible.html#rest-service:reviews-v1:id:comments:general
     *
     * @param {String} reviewId
     * @param {Boolean} render
     * @param {Function} callback
     */
    this.getReviewCommentsGeneral = function(reviewId, render, callback) {
        this.get(this.makeUri('cru', '/reviews-v1/' + reviewId + '/comments/general' +
            (render ? '?render=true' : '')), responseHandleFactory(callback));
    };

    /**
     * Get all versioned comments visible to the requesting user for the review.
     * @uri https://docs.atlassian.com/fisheye-crucible/latest/wadl/crucible.html#rest-service:reviews-v1:id:comments:general
     *
     * @param {String} reviewId
     * @param {Boolean} render
     * @param {Function} callback
     */
    this.getReviewCommentsVersioned = function(reviewId, render, callback) {
        this.get(this.makeUri('cru', '/reviews-v1/' + reviewId + '/comments/versioned' +
            (render ? '?render=true' : '')), responseHandleFactory(callback));
    };

    /**
     * Gets the given comment.
     * @uri https://docs.atlassian.com/fisheye-crucible/latest/wadl/crucible.html#rest-service:reviews-v1:id:comments:cId
     *
     * @param {String} reviewId
     * @param {String} commentId
     * @param {Boolean} render
     * @param {Function} callback
     */
    this.getReviewComment = function(reviewId, commentId, render, callback) {
        this.get(this.makeUri('cru', '/reviews-v1/' + reviewId + '/comments/' + commentId +
            (render ? '?render=true' : '')), responseHandleFactory(callback));
    };

    /**
     * Gets the replies to the given comment.
     * @uri https://docs.atlassian.com/fisheye-crucible/latest/wadl/crucible.html#rest-service:reviews-v1:id:comments:cId:replies
     *
     * @param {String} reviewId
     * @param {String} commentId
     * @param {Boolean} render
     * @param {Function} callback
     */
    this.getReviewCommentReplies = function(reviewId, commentId, render, callback) {
        this.get(this.makeUri('cru', '/reviews-v1/' + reviewId + '/comments/' + commentId + '/replies' +
            (render ? '?render=true' : '')), responseHandleFactory(callback));
    };


}).call(FecruApiClient.prototype);

module.exports.FecruApiClient = FecruApiClient;
module.exports.UserPreferenceKeys = UserPreferenceKeys;
module.exports.RecentlyVisitedItems = RecentlyVisitedItems;
module.exports.ReviewStates = ReviewStates;