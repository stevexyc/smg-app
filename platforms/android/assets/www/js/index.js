// Determines if one string starts with another string (case insensitive)
function startsWith(haystack, needle) {
	return !(haystack.toLowerCase().indexOf(needle.toLowerCase()));
}
// Process the raw event data from the API
function processEvents(events) {
	return events.DATA.map(function(row) {
		var event = row.reduce(function(curr, next, i) {
			var name = events.COLUMNS[i].toLowerCase();
			curr[name] = next;
			return curr;
		}, {});
		if(event.weblink == "http://") {
			delete event.weblink;
		}
		if(event.endtime == "January, 01 1900 00:00:00") {
			delete event.endtime;
		}
		if(event.message == "") {
			delete event.message;
		}
		if(event.contactname == "admin") {
			delete event.contactname;
		}
		var date = moment(new Date(event.eventdate)),
			allday = !(date.minute() || date.hour());
		event.time = !allday
						? date.format(date.minute() ? 'h:mm a' : 'h a')
						: 'all day';
		event.date = date.format('MMMM D, YYYY') + (allday ? ' (all day)' : ' at ' + event.time);
		return event;
	});
}
// Based on a moment.js date, constructs a URL for getting calendar events
function getDateURL(start) {
	return	'http://smgapps.bu.edu/calendar/db/getday.cfm?year='
	+ start.format('YYYY')
	+ '&month='
	+ start.format('MM')
	+ '&day='
	+ start.format('DD')
	+ '&callback=JSON_CALLBACK';
}



angular.module('SMGApp',['ngTouch'])
.controller('mainCtrl', ['$scope', '$http', '$q', '$timeout', function($scope, $http, $q, $timeout) {
	// alert(Object.keys(window.plugins));

	// Opens 'url' in the in-app web browser
	$scope.browseTo = function(url) {
		window.open(url, '_blank');
	}

	// Switch to a different page of the application. 'page' is the name of the
	// page to switch to.
	$scope.switchPage = function(page) {
		$scope.g.currentPage = page;
		$scope.g.specificEvent = null;
		$scope.g.specificPerson = null;
	}

	// Some of the scope's properties must be put inside of an object, so that child scopes
	// can set the properties without just shadowing them.
	$scope.g = {
		currentPage: 'Events', // Default page
		specificEvent: null, // Specific event being viewed
		specificPerson: null // Specific person being viewed
	};
}])
.controller('newsPage', ['$scope', '$http', function($scope, $http) {

	// Gets the latest news via a PHP proxy. Stores the operation's current state in $scope.newsState.
	$scope.getNews = function() {
		$scope.newsState = "loading";
		$http.jsonp('http://smgserv1.bu.edu/smgtools-homepage/proxy.php?callback=JSON_CALLBACK').success(function(news) {
			$scope.news = news;
			$scope.newsState = "loaded";
		}).error(function(news) {
			$scope.newsState = 'failed';
		})
	};

}])
.controller('hoursPage', ['$scope', '$http', function($scope, $http) {
	// Gets the current building hours, and store the operation's curren state in $scope.hoursState.
	$scope.getHours = function() {
		// console.log('getHours');
		$scope.hoursState = "loading";
		$http.jsonp('https://smgserv1.bu.edu/hours2/data.php?callback=JSON_CALLBACK').success(function(hours) {
			for(var name in hours) {
				// Normally, AngularJS would iterate through the properties in alphabetical order, rather
				// than that specified in the original JSON. Here, we store the order in an array.
				// Technically, for-in ordering is implementation-dependent, but in practice
				// all browsers use the order as specified in the JSON file.
				hours[name].order = [];
				for(var prop in hours[name]) {
					hours[name].order.push(prop);
				}
			}
			$scope.hours = hours;
			$scope.hoursState = "loaded";
		}).error(function() {
			$scope.hoursState = "failed";
		})
	}

}])
.controller('pplPage', ['$scope', '$http', function($scope, $http) {
	// Access and process the people data based on the search.
	// $scope.pplState stores the current state of the operation.
	$scope.getPeople = function() {
		$scope.pplState = "loading";
		var search = $scope.peopleSearch;
		if(search == '' || typeof search != 'string') {
			$scope.people = [];
			$scope.pplState = "loaded";
			return;
		}
		$http.jsonp('http://smgapps.bu.edu/smgnet/smginfo/search.cfm?callback=JSON_CALLBACK', {
			params: {
				q: search
			}
		}).success(function(people) {
			$scope.people = people.DATA.map(function(row) {
				return row.reduce(function(curr, next, i) {
					var name = people.COLUMNS[i].toLowerCase();
					curr[name] = next;
					return curr;
				}, {})
			});
			$scope.pplState = "loaded";
		}).error(function(people) {
			$scope.pplState = 'failed';
		})
	}

	// Rerun getPeople() when the user enters a search
	$scope.$watch('peopleSearch', function() {
		$scope.getPeople();
	})

	// Sorting function for the people search feature
	$scope.orderSearch = function(person) {
		if(
			startsWith(person.namefirst, $scope.peopleSearch) ||
			startsWith(person.namelast,  $scope.peopleSearch)
		) {
			return 1;
		} else {
			return 0;	
		}
	}

}])
.controller('eventsPage', ['$scope', '$http', '$q', '$timeout', function($scope, $http, $q, $timeout) {

	// In 'month' view, the height of the table cells must be determined in JavaScript,
	// since there is no (Android-compatible) way of doing this in pure CSS.
	// Put this in a $timeout() so that it waits for the month view to actually display.
	$scope.updateSize = function() {
		$timeout(function(){
			if($scope.view == "month") {
				var unit = $('body').width()/7;
				$('.cal-content td').height(unit);
				$('.cal-header').height(unit).css({
					'line-height': unit + 'px'
				});
			}
		})
	}

	// If view is 'shortWeek,' this switches to the 'Day' view on the calendar.
	// If view is 'month,' this switches to 'Month' view.
	$scope.changeView = function(view) {
		$scope.view = view;
		$scope.updateSize();		
	};


	// Adds the events from a day (in moment.js format) onto the calendar.
	$scope.addDay = function(newDay) {
		return $http.jsonp(getDateURL(newDay), {cache:true}).success(function(events) {
			$scope.events[newDay.format('YYYY-MM-DD')] = processEvents(events);
		});
	};

	// Determines how many weeks before and after the current one must be displayed on the calendar
	// in order to fix the whole month, and returns an array of the form [-2, -1, 0, 1, 2]
	// (in this example, we must take into account 2 earlier and 2 later weeks).
	$scope.getWeeks = function() {
		var start = $scope.nextDay.clone().startOf('month').startOf('week').diff($scope.nextDay, 'weeks'),
			end = $scope.nextDay.clone().endOf('month').endOf('week').diff($scope.nextDay, 'weeks');

		return Array.apply(null, (new Array(end-start + 1))).map(function(_, i) { return i + start; });
	}

	// Get event data using $scope.addDay(),
	// and store the current state of the operation in $scope.calState
	$scope.getCal = function() {
			if($scope.nextDay) {
				$scope.calState = "loading";
				$scope.events = {};		
				var promiseList = [];
				for(var i=0; i<5; i++) {
					promiseList.push($scope.addDay($scope.nextDay.clone().add('days', i)));
				}
				$q.all(promiseList).then(function(x) {
					$scope.calState = "loaded";
				}, function() {
					$scope.calState = "failed";
				});
			}
		};
	
	// Make the calendar switch to the specified day (in moment.js format).
	// The day will become teal in color and the event list will update.
	$scope.moveCal = function(day) {
		$scope.nextDay = day.clone();
		$scope.getCal(true);

		$scope.weekDates = [-2,-1,0,1,2].map(function(i){
			return $scope.nextDay.clone().add(i, 'days');
		});
	
		$scope.monthDates = $scope.getWeeks().map(function(row) {
			return [0, 1, 2, 3, 4, 5, 6].map(function(i) {
				return $scope.nextDay.clone().add(row, 'weeks').day(i);
			});
		});
		$scope.updateSize();
	}


	// At the start, move the calendar to the current day
	$scope.moveCal(moment());
	$timeout(function() {
		$scope.$apply(function() {
			$scope.changeView('shortWeek');	
		})
	});
	
}])
.directive('navButton', function() {
	// This directive is used to create the buttons in the bottom nav.
	return {
		restrict: 'E',
		scope: {
			'icon': '@icon',
			'name': '@name',
			'btnClick': '&',
			'g' : '='
		},
		transclude: true,
		template:
			'<div class="topcoat-tab-bar__item">' // If this is a <label>, then android has issues with the SMGTools button
		+		'<input type="radio" name="topcoat" value="{{name}}" ng-model="g.currentPage">'
		+		'<button class="topcoat-tab-bar__button full" ng-click="btnClick()">'
		+			'<i ng-class="[\'fa\',icon]"></i>'
		+			'<span ng-transclude></span>'
		+		'</button>'
		+	'</div>'
	}
})
.directive('weblink', function() {
	// This directive creates links with icons appropriate for the protocol being linked to.
	return {
		restrict: 'E',
		scope: {
			'href' : '@'
		},
		transclude: true,
		template: '<a href="{{href}}" ng-click="click($event)">'
		+ '<i ng-class="[\'fa\',icon]"></i><span ng-transclude></span>'
		+ '</a>',
		link: function($scope, element, attrs) {
			$scope.icon = /^mailto/.test(attrs.href) ? 'fa-envelope' :
							(/^tel/.test(attrs.href) ? 'fa-phone' : 'fa-external-link')
			$scope.click = function(e) {
				if(!/^(mailto|tel)/.test(attrs.href)) {
					// This ensures that the page is opened in the InAppBrowser.
					window.open(attrs.href, '_blank');
					e.preventDefault();
				}
				
			};
		}
	}
})
.directive('ifAjax', function() {
	// This directive shows a "loading" spinner while an ajax operation is in progress,
	// and an error message with a retry button if the operation has failed.
	return {
		restrict: 'E',
		scope: {
			'state': '@state'
		},
		transclude: true,
		template:
				'<div ng-switch="state">'
			+		'<div ng-switch-when="loading" class="loading"><i class="fa fa-spinner fa-spin fa-2x"></i></div>'
			+		'<div ng-switch-when="loaded" ng-transclude></div>'
			+		'<div ng-switch-when="failed" class="load-error">'
			+			'<h2><i class="fa fa-times"></i> Failed to load</h2>'
			+			'<button class="topcoat-button">Retry</button>'
			+		'</div>'
			+	'</div>',
		link: function(scope, element, attrs) {
			scope.$parent.$eval(attrs.onLoad);
			scope.$watch('state', function() {
				$('.load-error button', element).on('click', function() {
					
					scope.$parent.$eval(attrs.onLoad);
					scope.$parent.$digest();
				})
			});
		
			
		}
	}
})
.filter('phoneLink', function() {
	// This filter creates 'tel:' links
	return function(input) {
		return 'tel:' + input.replace(/[^0-9]/g, '');
	}
})