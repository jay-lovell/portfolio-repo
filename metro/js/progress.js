/**
 * Progress calculation and display logic
 */

const ProgressTracker = (() => {
    let stationsData = null;

    const init = (data) => {
        stationsData = data;
    };

    /**
     * Get the total number of unique stations
     */
    const getTotalStations = () => {
        if (!stationsData) return 0;
        return stationsData.stations.length;
    };

    /**
     * Get the total number of stations on a specific line
     */
    const getStationsOnLine = (line) => {
        if (!stationsData) return 0;
        return stationsData.stations.filter(station => station.lines.includes(line)).length;
    };

    /**
     * Check if a specific station/line target is complete
     * For normal stations: image exists and datePhotographed is set
     * For interchanges: all required line targets must be complete
     */
    const isTargetComplete = (targets, line) => {
        if (!targets) return false;
        const target = targets.find(t => t.line === line);
        if (!target) return false;
        let complete = target.image && target.datePhotographed !== null && target.datePhotographed !== undefined && target.datePhotographed !== '';
        // A target is complete if it has a valid image path and datePhotographed is set
        console.log("Target complete for " + target.image + " is " + complete)
        return target.image && target.datePhotographed !== null && target.datePhotographed !== undefined && target.datePhotographed !== '';
    };

    /**
     * Check if a complete station is photographed on all required lines
     * For normal stations: 1 line, must be complete
     * For interchanges: all lines must be complete
     */
    const isStationComplete = (station) => {
        if (!station.targets) return false;
        // All targets must be complete
        let complete =station.targets.every(target => isTargetComplete(station.targets, target.line));
                console.log("Station complete for " + station.name + " is " + complete)

        return station.targets.every(target => isTargetComplete(station.targets, target.line));
    };

    /**
     * Count completed stations total
     */
    const getCompletedStations = () => {
        if (!stationsData) return 0;
        return stationsData.stations.filter(station => isStationComplete(station)).length;
    };

    /**
     * Count completed stations on a specific line
     */
    const getCompletedStationsOnLine = (line) => {
        if (!stationsData) return 0;
        return stationsData.stations
            .filter(station => station.lines.includes(line))
            .filter(station => {
                // For this line, check if all targets for this line are complete
                const lineTargets = station.targets.filter(t => t.line === line);
                return lineTargets.length > 0 && lineTargets.every(target => isTargetComplete(station.targets, target.line));
            })
            .length;
    };

    /**
     * Get progress percentage
     */
    const getProgressPercentage = (completed, total) => {
        if (total === 0) return 0;
        return Math.round((completed / total) * 100);
    };

    /**
     * Get complete progress data
     */
    const getProgressData = () => {
        const total = getTotalStations();
        const completed = getCompletedStations();

        return {
            overall: {
                completed,
                total,
                percentage: getProgressPercentage(completed, total)
            },
            byLine: {
                A: {
                    completed: getCompletedStationsOnLine('A'),
                    total: getStationsOnLine('A'),
                    percentage: getProgressPercentage(getCompletedStationsOnLine('A'), getStationsOnLine('A'))
                },
                B: {
                    completed: getCompletedStationsOnLine('B'),
                    total: getStationsOnLine('B'),
                    percentage: getProgressPercentage(getCompletedStationsOnLine('B'), getStationsOnLine('B'))
                },
                C: {
                    completed: getCompletedStationsOnLine('C'),
                    total: getStationsOnLine('C'),
                    percentage: getProgressPercentage(getCompletedStationsOnLine('C'), getStationsOnLine('C'))
                }
            }
        };
    };

    /**
     * Update the progress display
     */
    const updateDisplay = () => {
        const data = getProgressData();

        // Overall progress
        document.getElementById('overall-count').textContent = `${data.overall.completed} / ${data.overall.total}`;
        document.getElementById('overall-percentage').textContent = `${data.overall.percentage}%`;
        document.getElementById('overall-progress-bar').style.width = `${data.overall.percentage}%`;

        // Line A progress
        document.getElementById('line-a-count').textContent = `${data.byLine.A.completed} / ${data.byLine.A.total}`;
        document.getElementById('line-a-percentage').textContent = `${data.byLine.A.percentage}%`;
        document.getElementById('line-a-progress-bar').style.width = `${data.byLine.A.percentage}%`;

        // Line B progress
        document.getElementById('line-b-count').textContent = `${data.byLine.B.completed} / ${data.byLine.B.total}`;
        document.getElementById('line-b-percentage').textContent = `${data.byLine.B.percentage}%`;
        document.getElementById('line-b-progress-bar').style.width = `${data.byLine.B.percentage}%`;

        // Line C progress
        document.getElementById('line-c-count').textContent = `${data.byLine.C.completed} / ${data.byLine.C.total}`;
        document.getElementById('line-c-percentage').textContent = `${data.byLine.C.percentage}%`;
        document.getElementById('line-c-progress-bar').style.width = `${data.byLine.C.percentage}%`;
    };

    return {
        init,
        getTotalStations,
        getStationsOnLine,
        isStationComplete,
        isTargetComplete,
        getCompletedStations,
        getCompletedStationsOnLine,
        getProgressPercentage,
        getProgressData,
        updateDisplay
    };
})();
