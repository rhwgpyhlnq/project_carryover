sap.ui.define([
    "sap/fe/test/JourneyRunner",
	"projectcarryover/test/integration/pages/RunsList.gen",
	"projectcarryover/test/integration/pages/RunsObjectPage.gen"
], function (JourneyRunner, RunsListGenerated, RunsObjectPageGenerated) {
    'use strict';

    const runner = new JourneyRunner({
        launchUrl: sap.ui.require.toUrl('projectcarryover') + '/test/flp.html#app-preview',
        pages: {
			onTheRunsListGenerated: RunsListGenerated,
			onTheRunsObjectPageGenerated: RunsObjectPageGenerated
        },
        async: true
    });

    return runner;
});

