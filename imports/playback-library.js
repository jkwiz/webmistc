import {Meteor} from 'meteor/meteor';
import {start} from './recording-library.js';
import {Session} from 'meteor/session';

export var Playback = {};

//HACK: scope binding
const self = this;
let timings = [];
let videoTracking = null;
let pbSlideTracker = null; //Timer to keep the playback slider in the correct position
let startedTime = -1;
let elapsedTime = -1;
let recordings = "";
let isPaused = false;

// HACK: need to figure out the proper scoping to 
// access this from the overlay library
function replaceNote(whichNote, title, number) {
    const d3Notes = d3.select(".annotation");
    // console.log(d3Notes);
    const d3LastNode = d3Notes[0].pop();
    if (d3LastNode) {
        $(d3LastNode).remove();
        const id = d3LastNode.id;
        Meteor.call('markEraser', title, number, id);
    }
};

function initTimes(recordings) {
    const start = _.head(recordings);
    const stop = _.last(recordings);
    self.start = start.time;
    self.stop = stop.time;
}

function removeTimes(recordings) {
    // drop first and last element
    recordings = _.drop(recordings);
    recordings = _.dropRight(recordings);
    return recordings;
}

Playback.upload = function (json) {
    initTimes(json);
    recordings = removeTimes(json);
};

Playback.skipBack = function () {
    if (isPaused) {
        elapsedTime = elapsedTime - 5000;
        if (elapsedTime < 0) {elapsedTime = 0;}
    } else {
        Playback.pause();
        elapsedTime = elapsedTime - 5000;
        if (elapsedTime < 0) {elapsedTime = 0;}
        Playback.play();
    }
};

Playback.stop = function () {
	// Clear timers tracking the video and reset playback slider
	Playback.cleanup();
	$('#pbslider').slider('setValue', 0);
	
    _.each(timings, function(timing){
        Meteor.clearTimeout(timing)
    })
    isPaused = false;
    startedTime = -1;
    elapsedTime = -1;
};

Playback.pause = function () {
	Playback.cleanup();
	
    _.each(timings, function(timing){
        Meteor.clearTimeout(timing)
    })
    isPaused = true;
    elapsedTime = Date.now()-startedTime;
};

Playback.play = function () {
    trackVideo();
    let firstTimeStamp = self.start;
    isPaused = false;
    startedTime = Date.now();
	
	// If playback is NOT being started from a stop
    if (elapsedTime != -1) {
        firstTimeStamp += elapsedTime;
        startedTime += elapsedTime;
        elapsedTime = -1;
    }
    _.each(recordings, function (recording) {
        if (recording.time - firstTimeStamp > 0) {
            timings.push(Meteor.setTimeout(
                function () {
                    switch (recording.state) {
                        case 'session':
                            const sessionState = recording.params[0];
                            Session.set(recording.action, sessionState);
                            break;
                        case 'database':
                            const isReplaceOn = Session.get('overlay.tool.replace');
                            if (isReplaceOn) {
                                const title = recording.params[0];
                                const page = recording.params[1];
                                replaceNote('previous', title, page);
                            }
                            Meteor.apply(recording.action, recording.params);
                            break;
                    }
                },
                ( parseInt(recording.time - firstTimeStamp) )
            ));
        }
    });
};

Playback.skipForward = function () {
    if (isPaused) {
        elapsedTime = elapsedTime + 5000;
    } else {
        Playback.pause();
        elapsedTime = elapsedTime + 5000;
        Playback.play();
    }
};

// This is straight from slackOverflow
String.prototype.toHHMMSS = function () {
    var sec_num = parseInt(this, 10); // don't forget the second param
    var hours   = Math.floor(sec_num / 3600);
    var minutes = Math.floor((sec_num - (hours * 3600)) / 60);
    var seconds = sec_num - (hours * 3600) - (minutes * 60);

    //if (hours   < 10) {hours   = "0"+hours;}
    if (minutes < 10) {minutes = "0"+minutes;}
    if (seconds < 10) {seconds = "0"+seconds;}
    return hours+':'+minutes+':'+seconds;
};

trackVideo = function (){
	let video = document.getElementById('uploadedRecording');

	// Timer to keep track of the current playback time in the video
    videoTracking = Meteor.setInterval(
		function(){
			console.log("currentTime: "+video.currentTime);
			document.getElementById('position').placeholder=video.currentTime.toString().toHHMMSS();
		}, 500 // milliseconds
	);
	
	// For tracking the playback slider
	let sliderMax = $("#pbslider").data("slider-max");
	let interval = video.duration / sliderMax;
	if (video.currentTime === 0) $('#pbslider').slider('setValue', 0);
	if (video.currentTime !== 0) $('#pbslider').slider('setValue', video.currentTime / interval);
	pbSlideTracker = Meteor.setInterval(function () {
		let currentPosition = video.currentTime / interval;
		console.log("Slide: " + video.currentTime / interval)
		$('#pbslider').slider('setValue', currentPosition);
	}, interval * 1000);
};

Playback.cleanup = function() {
	console.log("playback stopped");
    Meteor.clearInterval(videoTracking);
	Meteor.clearInterval(pbSlideTracker);
}