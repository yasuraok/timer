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

    // 全タスクの合計時間を計算
    const totalDuration = tasks.reduce((sum, task) => sum + task.duration, 0);

    // バッファー時間セグメントを最初に追加
    if (config && config.bufferMinutes > 0) {
        const bufferSegment = document.createElement('div');
        bufferSegment.className = 'task-segment buffer-segment';
        bufferSegment.style.backgroundColor = '#e0e0e0';
        bufferSegment.style.flexGrow = config.bufferMinutes.toString();

        // 状況に応じたメッセージを表示
        const completedCount = completedTasks.size;
        const totalCount = tasks.length;
        let message = '';
        
        if (completedCount === 0) {
            message = 'がんばろう！';
        } else if (completedCount === totalCount) {
            message = 'よくできました！';
        } else {
            message = `あと${totalCount - completedCount}つ！`;
        }

        bufferSegment.innerHTML = `
            <div class="task-name-label">余裕</div>
            <div class="task-duration-label">${message}</div>
        `;

        tasksBar.appendChild(bufferSegment);
    }

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
        segment.style.flexGrow = task.duration.toString();

        segment.innerHTML = `
            <div class="task-name-label">${task.name}</div>
            <div class="task-duration-label">${task.duration}分</div>
        `;

        segment.onclick = () => toggleTask(index);

        tasksBar.appendChild(segment);
    });
}

/**
 * タスクの完了/未完了をトグル
 * @param {number} taskId - タスクインデックス
 */
function toggleTask(taskId) {
    if (completedTasks.has(taskId)) {
        completedTasks.delete(taskId);
    } else {
        completedTasks.add(taskId);
    }
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
    let totalMinutes = 0;
    tasks.forEach((task, index) => {
        if (!completedTasks.has(index)) {
            totalMinutes += task.duration;
        }
    });
    return totalMinutes * 60; // 秒に変換
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

// タイマーを更新
function updateTimer() {
    const now = new Date();
    const target = getTargetDate();
    const remainingSeconds = Math.floor((target.getTime() - now.getTime()) / 1000);
    const remainingTaskSeconds = getRemainingTaskTime();

    // 現在時刻を表示
    setText('currentTime', formatTime(now));

    // 目標時刻を表示
    setText('targetTime', formatTimeShort(target));

    // カウントダウン表示
    setText('countdown', formatDuration(remainingSeconds));

    // 残り時間とタスク合計時間を表示
    setText('remainingTime', formatDuration(remainingSeconds));
    setText('totalTaskTime', formatDuration(remainingTaskSeconds));

    // 警告メッセージ
    const isWarning = remainingTaskSeconds > remainingSeconds && remainingSeconds > 0;
    const warningMessage = isWarning ? `⚠️ 時間が ${formatDuration(remainingTaskSeconds - remainingSeconds)} 足りません！` : '';
    setText('warningText', warningMessage);

    // プログレスバーを更新
    updateProgress();

    // 時間切れの場合、アラームを鳴らす
    if (remainingSeconds <= 0 && !alarmPlayed) {
        playAlarm();
        alarmPlayed = true;
    }

    // 時間が復活した場合、アラームフラグをリセット
    if (remainingSeconds > 0) {
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
    const countdownEl = document.getElementById('countdown');
    if (countdownEl) {
        countdownEl.style.color = '#ff0000';
        countdownEl.textContent = '時間です！';
    }
}

// タイマーを開始
function startTimer() {
    updateTimer(); // 即座に更新
    timerInterval = setInterval(updateTimer, 1000); // 1秒ごとに更新
}

// ページ読み込み時に初期化
window.addEventListener('DOMContentLoaded', init);
