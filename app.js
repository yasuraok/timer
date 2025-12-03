// @ts-check

/**
 * @typedef {Object} Task
 * @property {string} name - タスク名
 * @property {number} duration - 所要時間（分）
 * @property {string} color - タスクの色
 */

/**
 * @typedef {Object} Config
 * @property {string} targetTime - 目標時刻 (HH:MM形式)
 * @property {number} bufferMinutes - 余剰時間（分）
 * @property {Task[]} tasks - タスクリスト
 * @property {string} alarmSound - アラーム音ファイル名
 */

// グローバル変数
/** @type {Config | null} */
let config = null;
/** @type {Task[]} */
let tasks = [];
/** @type {Set<number>} */
let completedTasks = new Set();
/** @type {number | null} */
let timerInterval = null;
/** @type {boolean} */
let alarmPlayed = false;

/**
 * URLパラメータから目標時刻を取得
 * @returns {string | null} HH:MM形式の時刻、またはnull
 */
function getTargetTimeFromURL() {
    const params = new URLSearchParams(window.location.search);
    const time = params.get('time');
    if (!time) return null;

    // HHMM形式からHH:MMに変換
    if (/^\d{4}$/.test(time)) {
        const hours = time.substring(0, 2);
        const minutes = time.substring(2, 4);
        // 有効な時刻かチェック
        if (parseInt(hours) >= 0 && parseInt(hours) <= 23 &&
            parseInt(minutes) >= 0 && parseInt(minutes) <= 59) {
            return `${hours}:${minutes}`;
        }
    }
    return null;
}

// 初期化
async function init() {
    try {
        const response = await fetch('config.json');
        config = await response.json();
        if (!config) throw new Error('Config is null');

        // URLパラメータから目標時刻を上書き
        const urlTime = getTargetTimeFromURL();
        if (urlTime) {
            config.targetTime = urlTime;
        }

        tasks = [...config.tasks];
        renderTasks();
        startTimer();
    } catch (error) {
        console.error('設定ファイルの読み込みに失敗しました:', error);
        alert('設定ファイルの読み込みに失敗しました。config.jsonを確認してください。');
    }
}

/**
 * タスクバーを描画
 */
function renderTasks() {
    const tasksBar = document.getElementById('tasksBar');
    if (!tasksBar) return;
    tasksBar.innerHTML = '';

    // バッファーセグメントの幅を設定
    updateBufferSegmentWidth();

    // タスクをソート: 1. 完了済みが左、未完了が右 2. 元の定義順
    const sortedTaskIndices = tasks
        .map((task, index) => ({ task, index }))
        .sort((a, b) => {
            const aCompleted = completedTasks.has(a.index);
            const bCompleted = completedTasks.has(b.index);
            if (aCompleted && !bCompleted) return -1;
            if (!aCompleted && bCompleted) return 1;
            return a.index - b.index;
        });

    sortedTaskIndices.forEach(({ task, index }) => {
        const segment = document.createElement('div');
        segment.className = 'task-segment';
        if (completedTasks.has(index)) {
            segment.classList.add('completed');
        }
        segment.style.backgroundColor = task.color;
        segment.style.flex = `${task.duration} 1 0`;

        // 改行を<br>に変換
        const taskNameWithBreaks = task.name.replace(/\n/g, '<br>');

        segment.innerHTML = `
            <div class="task-name-label">${taskNameWithBreaks}</div>
            <div class="task-duration-label task-time">${task.duration}分</div>
        `;

        segment.onclick = () => toggleTask(index);

        tasksBar.appendChild(segment);
    });
}

/**
 * バッファーセグメントの幅を設定
 */
function updateBufferSegmentWidth() {
    const bufferContainer = document.getElementById('bufferSegmentContainer');
    if (!bufferContainer || !config) return;

    const totalMinutes = getTotalTaskTime() / 60 + (config.bufferMinutes || 0);
    if (totalMinutes === 0) {
        bufferContainer.style.display = 'none';
        return;
    }

    const widthPercent = ((config.bufferMinutes || 0) / totalMinutes) * 100;
    bufferContainer.style.flex = `0 0 ${widthPercent}%`;
    bufferContainer.style.display = widthPercent > 0 ? 'flex' : 'none';
}

/**
 * タスクの完了/未完了をトグル
 * @param {number} taskId - タスクインデックス
 */
function toggleTask(taskId) {
    completedTasks.has(taskId) ? completedTasks.delete(taskId) : completedTasks.add(taskId);
    renderTasks();
    updateProgress();
}

/**
 * 時刻を H:MM:SS 形式にフォーマット（時の先頭0なし）
 * @param {Date} date - フォーマットする日時
 * @returns {string} フォーマットされた時刻
 */
function formatTime(date) {
    const hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

/**
 * 時刻を H:MM:SS 形式にフォーマット（秒は:00固定、時の先頭0なし）
 * @param {Date} date - フォーマットする日時
 * @returns {string} フォーマットされた時刻
 */
function formatTimeShort(date) {
    const hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}:00`;
}

/**
 * 秒数を MM:SS 形式にフォーマット
 * @param {number} seconds - 秒数
 * @returns {string} フォーマットされた時間
 */
function formatDuration(seconds) {
    if (seconds < 0) seconds = 0;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * 要素のテキストコンテンツを設定
 * @param {string} id - 要素ID
 * @param {string} text - 設定するテキスト
 */
function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

/**
 * バッファーメッセージを更新
 */
function updateBufferMessage() {
    const bufferMessage = document.getElementById('bufferMessage');
    if (!bufferMessage) return;

    const now = new Date();
    const target = getTargetDate();
    const remainingSeconds = Math.floor((target.getTime() - now.getTime()) / 1000);
    const remainingTaskSeconds = getRemainingTaskTime();
    const completedCount = completedTasks.size;
    const totalCount = tasks.length;

    // 時間不足の場合は文字色を赤に変更
    const isTimeLacking = remainingTaskSeconds > remainingSeconds && remainingSeconds > 0;
    bufferMessage.style.color = isTimeLacking ? '#ff0000' : '#666';

    // メッセージを設定
    const message = completedCount === 0
        ? 'がんばろう！'
        : completedCount === totalCount
        ? 'よくできました！'
        : `あと${totalCount - completedCount}つ！`;

    bufferMessage.textContent = message;
}

/**
 * 目標時刻を取得
 * @returns {Date} 目標時刻
 */
function getTargetDate() {
    if (!config) throw new Error('Config not loaded');
    const [hours, minutes] = config.targetTime.split(':').map(Number);
    const now = new Date();
    const target = new Date();
    target.setHours(hours, minutes, 0, 0);

    // もし目標時刻が過去なら、翌日にする
    if (target <= now) {
        target.setDate(target.getDate() + 1);
    }

    return target;
}

/**
 * 残りタスクの合計時間を計算（秒単位）
 * @returns {number} 残りタスクの合計秒数
 */
function getRemainingTaskTime() {
    return tasks.reduce((total, task, index) =>
        completedTasks.has(index) ? total : total + task.duration, 0) * 60;
}

/**
 * 全タスクの合計時間を計算（秒単位）
 * @returns {number} 全タスクの合計秒数
 */
function getTotalTaskTime() {
    const totalMinutes = tasks.reduce((sum, task) => sum + task.duration, 0);
    return totalMinutes * 60; // 秒に変換
}

/**
 * プログレスバーを更新
 */
function updateProgress() {
    const remainingTimeBar = document.getElementById('remainingTimeBar');
    if (!remainingTimeBar || !config) return;

    const now = new Date();
    const target = getTargetDate();
    const remainingSeconds = Math.floor((target.getTime() - now.getTime()) / 1000);
    const totalTaskSeconds = getTotalTaskTime();
    const bufferSeconds = (config.bufferMinutes || 0) * 60;

    // 残り時間バーの幅を計算（全タスク合計時間 + バッファー時間を１００％とする）
    const totalTimeWithBuffer = totalTaskSeconds + bufferSeconds;
    if (totalTimeWithBuffer > 0) {
        const widthPercent = Math.min(100, (remainingSeconds / totalTimeWithBuffer) * 100);
        remainingTimeBar.style.width = `${widthPercent}%`;
    } else {
        remainingTimeBar.style.width = '0%';
    }
}



/**
 * タイマーを更新
 */
function updateTimer() {
    const now = new Date();
    const target = getTargetDate();
    const remainingSeconds = Math.floor((target.getTime() - now.getTime()) / 1000);

    // 時刻表示を更新
    setText('currentTime', formatTime(now));
    setText('targetTime', formatTimeShort(target));
    setText('remainingTime', formatDuration(remainingSeconds));

    // バッファーメッセージとプログレスバーを更新
    updateBufferMessage();
    updateProgress();

    // アラーム処理
    if (remainingSeconds <= 0 && !alarmPlayed) {
        playAlarm();
        alarmPlayed = true;
    } else if (remainingSeconds > 0) {
        alarmPlayed = false;
    }
}

/**
 * アラームを再生
 */
function playAlarm() {
    const audio = document.getElementById('alarmAudio');
    if (!audio || !(audio instanceof HTMLAudioElement)) return;
    audio.play().catch(error => {
        console.log('アラーム音の再生に失敗しました:', error);
    });

    // 視覚的なアラート
    const remainingTimeEl = document.getElementById('remainingTime');
    if (remainingTimeEl) {
        remainingTimeEl.style.color = '#ff0000';
    }
}

// タイマーを開始
function startTimer() {
    updateTimer(); // 即座に更新
    timerInterval = setInterval(updateTimer, 1000); // 1秒ごとに更新
}

// ページ読み込み時に初期化
window.addEventListener('DOMContentLoaded', init);
