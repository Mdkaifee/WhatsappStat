import Chart from "chart.js/auto";
import html2canvas from "html2canvas";

const fileInput = document.getElementById("chatFile");
const statusEl = document.getElementById("status");
const preUploadSectionEl = document.getElementById("preUploadSection");
const resultsEl = document.getElementById("results");
const reportCaptureEl = document.getElementById("reportCapture");
const saveImageBtnEl = document.getElementById("saveImageBtn");
const manualDownloadLinkEl = document.getElementById("manualDownloadLink");
const totalMessagesValueEl = document.getElementById("totalMessagesValue");
const topSenderValueEl = document.getElementById("topSenderValue");
const topSenderLabelEl = document.getElementById("topSenderLabel");
const peakHourValueEl = document.getElementById("peakHourValue");
const peakHourLabelEl = document.getElementById("peakHourLabel");
const topEmojiValueEl = document.getElementById("topEmojiValue");
const topEmojiLabelEl = document.getElementById("topEmojiLabel");
const topWeekdayValueEl = document.getElementById("topWeekdayValue");
const topWeekdayLabelEl = document.getElementById("topWeekdayLabel");

const participantPieCanvas = document.getElementById("participantPieChart");
const hourBarCanvas = document.getElementById("hourBarChart");
const emojiBarCanvas = document.getElementById("emojiBarChart");
const weekdayBarCanvas = document.getElementById("weekdayBarChart");

const DATE_PATTERNS = [
  /^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s*(\d{1,2}):(\d{2})(?:\s?([APap][Mm]))?\s*[-–]\s*(.*)$/,
  /^(\d{1,2})\.(\d{1,2})\.(\d{2,4}),\s*(\d{1,2}):(\d{2})(?:\s?([APap][Mm]))?\s*[-–]\s*(.*)$/,
  /^\[(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s*(\d{1,2}):(\d{2})(?::\d{2})?(?:\s?([APap][Mm]))?\]\s*(.*)$/,
];

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const HOURS = Array.from({ length: 24 }, (_, hour) => hourRangeLabel(hour));
const CHART_COLORS = [
  "rgba(114, 182, 194, 0.78)",
  "rgba(135, 163, 120, 0.78)",
  "rgba(177, 134, 163, 0.78)",
  "rgba(207, 189, 116, 0.78)",
  "rgba(177, 140, 127, 0.78)",
  "rgba(125, 173, 145, 0.78)",
];

let charts = [];

saveImageBtnEl.addEventListener("click", () => {
  void saveReportImage();
});

manualDownloadLinkEl.addEventListener("click", (event) => {
  const href = manualDownloadLinkEl.getAttribute("href");
  if (href && href !== "#") {
    return;
  }

  event.preventDefault();
  void saveReportImage();
});

fileInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) {
    return;
  }

  statusEl.textContent = "Reading and parsing chat export...";

  try {
    const text = await file.text();
    const messages = parseChatText(text);
    if (!messages.length) {
      resultsEl.classList.add("hidden");
      statusEl.textContent =
        "Could not detect WhatsApp messages. Export chat as .txt and try again.";
      return;
    }

    const stats = buildStats(messages);
    renderReport(stats);
    preUploadSectionEl.classList.add("hidden");
    resultsEl.classList.remove("hidden");
    document.body.classList.add("showing-stats");
    statusEl.textContent = `Parsed ${formatNum(stats.totalMessages)} messages from ${formatNum(
      stats.participantCount
    )} participants.`;
  } catch (error) {
    console.error(error);
    resultsEl.classList.add("hidden");
    statusEl.textContent = "Could not parse this file. Try another WhatsApp export .txt.";
  }
});

function parseChatText(text) {
  const lines = normalizeRawChatText(text).split("\n");
  const messages = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line) {
      continue;
    }

    const parsed = parseMessageStart(line);
    if (parsed) {
      if (current) {
        messages.push(current);
      }
      current = parsed;
    } else if (current) {
      current.message += `\n${line}`;
    }
  }

  if (current) {
    messages.push(current);
  }

  return messages;
}

function normalizeRawChatText(text) {
  return text
    .replace(/[\u200e\u200f\u202a-\u202e]/g, "")
    .replace(/\u202f/g, " ")
    .replace(/\r\n?/g, "\n")
    .replace(
      /(\d{1,2}[/.]\d{1,2}[/.]\d{2,4}),\s*\n\s*(\d{1,2}:\d{2}(?::\d{2})?\s*(?:[APap][Mm])?)/g,
      "$1, $2"
    )
    .replace(
      /(\[\d{1,2}\/\d{1,2}\/\d{2,4}),\s*\n\s*(\d{1,2}:\d{2}(?::\d{2})?\s*(?:[APap][Mm])?\])/g,
      "$1, $2"
    )
    .replace(/(\d{1,2}:\d{2}(?::\d{2})?\s*(?:[APap][Mm])?)\s*\n\s*[-–]\s*/g, "$1 - ")
    .replace(
      /([^\n\d])(\d{1,2}[/.]\d{1,2}[/.]\d{2,4},\s\d{1,2}:\d{2}(?::\d{2})?\s?(?:[APap][Mm])?\s[-–]\s)/g,
      "$1\n$2"
    )
    .replace(
      /([^\n\d])(\[\d{1,2}\/\d{1,2}\/\d{2,4},\s\d{1,2}:\d{2}(?::\d{2})?\s?(?:[APap][Mm])?\]\s)/g,
      "$1\n$2"
    );
}

function parseMessageStart(line) {
  const normalizedLine = line.replace(/^[\u200e\u200f\u202a-\u202e]+/, "").trimStart();

  for (const pattern of DATE_PATTERNS) {
    const match = normalizedLine.match(pattern);
    if (!match) {
      continue;
    }

    const [, d1, d2, yRaw, hRaw, mRaw, ampmRaw, remainder] = match;
    const year = normalizeYear(Number(yRaw));

    let day = Number(d1);
    let month = Number(d2);
    if (Number(d1) <= 12 && Number(d2) > 12) {
      day = Number(d2);
      month = Number(d1);
    }

    let hour = Number(hRaw);
    const minute = Number(mRaw);
    const ampm = ampmRaw?.toUpperCase();
    if (ampm === "PM" && hour < 12) {
      hour += 12;
    } else if (ampm === "AM" && hour === 12) {
      hour = 0;
    }

    const body = extractAuthorAndMessage(remainder);
    const timestamp = new Date(year, month - 1, day, hour, minute);
    if (!body || Number.isNaN(timestamp.getTime())) {
      return null;
    }

    return {
      timestamp,
      author: body.author,
      message: body.message,
      system: body.system,
    };
  }

  return null;
}

function extractAuthorAndMessage(remainder) {
  const splitIndex = remainder.indexOf(": ");
  if (splitIndex !== -1) {
    const author = remainder.slice(0, splitIndex).trim();
    const message = remainder.slice(splitIndex + 2).trim();

    return {
      author: author || "Unknown",
      message,
      system: false,
    };
  }

  const trimmed = remainder.trim();
  if (trimmed.endsWith(":")) {
    const trailingColonIndex = trimmed.lastIndexOf(":");
    const author = trimmed.slice(0, trailingColonIndex).trim();
    const message = trimmed.slice(trailingColonIndex + 1).trim();

    return {
      author: author || "Unknown",
      message,
      system: false,
    };
  }

  return {
    author: "System",
    message: remainder,
    system: true,
  };
}

function buildStats(messages) {
  const userMessages = messages.filter((msg) => !msg.system);
  const participantCounts = new Map();
  const byHour = Array(24).fill(0);
  const byWeekday = Array(7).fill(0);
  const emojiCounts = new Map();

  for (const msg of userMessages) {
    participantCounts.set(msg.author, (participantCounts.get(msg.author) || 0) + 1);
    byHour[msg.timestamp.getHours()] += 1;
    byWeekday[msg.timestamp.getDay()] += 1;

    for (const emoji of extractEmojis(msg.message)) {
      emojiCounts.set(emoji, (emojiCounts.get(emoji) || 0) + 1);
    }
  }

  const participants = [...participantCounts.entries()].sort((a, b) => b[1] - a[1]);
  const emojis = [...emojiCounts.entries()].sort((a, b) => b[1] - a[1]);

  const topSender = participants[0] || ["-", 0];
  const topHourIndex = indexOfMax(byHour);
  const topHourCount = byHour[topHourIndex] || 0;
  const topWeekdayIndex = indexOfMax(byWeekday);
  const topWeekdayCount = byWeekday[topWeekdayIndex] || 0;
  const topEmoji = emojis[0] || ["🙂", 0];

  return {
    totalMessages: userMessages.length,
    participantCount: participants.length,
    participants,
    byHour,
    byWeekday,
    topSender,
    topHourIndex,
    topHourCount,
    topWeekdayIndex,
    topWeekdayCount,
    topEmoji,
    emojiTop: emojis.slice(0, 8),
  };
}

function renderReport(stats) {
  destroyCharts();

  totalMessagesValueEl.textContent = formatNum(stats.totalMessages);
  topSenderValueEl.textContent = formatNum(stats.topSender[1]);
  topSenderLabelEl.textContent = `Messages Were Sent By ${stats.topSender[0]}`;
  peakHourValueEl.textContent = formatNum(stats.topHourCount);
  peakHourLabelEl.textContent = `Messages Were Sent Between ${hourRangeLabel(stats.topHourIndex)}`;
  topEmojiValueEl.textContent = stats.topEmoji[0];
  topEmojiLabelEl.textContent = `Was Sent ${formatNum(stats.topEmoji[1])} Times`;
  topWeekdayValueEl.textContent = formatNum(stats.topWeekdayCount);
  topWeekdayLabelEl.textContent = `Messages Were Sent On ${WEEKDAYS[stats.topWeekdayIndex]}`;

  charts.push(
    new Chart(participantPieCanvas, {
      type: "pie",
      data: {
        labels: stats.participants.map(([name]) => name),
        datasets: [
          {
            label: "# of Messages",
            data: stats.participants.map(([, value]) => value),
            backgroundColor: colorList(stats.participants.length),
            borderColor: "rgba(244, 244, 244, 0.9)",
            borderWidth: 2,
          },
        ],
      },
      options: commonOptions({
        plugins: {
          legend: {
            display: true,
            position: "top",
          },
        },
      }),
    })
  );

  charts.push(
    new Chart(hourBarCanvas, {
      type: "bar",
      data: {
        labels: HOURS,
        datasets: [
          {
            label: "# of Messages",
            data: stats.byHour,
            backgroundColor: stats.byHour.map((_, idx) =>
              idx === stats.topHourIndex ? "rgba(131, 186, 112, 0.85)" : "rgba(157, 140, 174, 0.55)"
            ),
          },
        ],
      },
      options: commonOptions({
        indexAxis: "y",
        scales: {
          x: {
            beginAtZero: true,
            ticks: {
              precision: 0,
            },
          },
        },
      }),
    })
  );

  const emojiData = stats.emojiTop.length ? stats.emojiTop : [["🙂", 0]];
  charts.push(
    new Chart(emojiBarCanvas, {
      type: "bar",
      data: {
        labels: emojiData.map(([emoji]) => emoji),
        datasets: [
          {
            label: "# of Emoji",
            data: emojiData.map(([, count]) => count),
            backgroundColor: colorList(emojiData.length),
          },
        ],
      },
      options: commonOptions({
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              precision: 0,
            },
          },
        },
      }),
    })
  );

  charts.push(
    new Chart(weekdayBarCanvas, {
      type: "bar",
      data: {
        labels: WEEKDAYS,
        datasets: [
          {
            label: "# of Messages",
            data: stats.byWeekday,
            backgroundColor: stats.byWeekday.map((_, idx) =>
              idx === stats.topWeekdayIndex ? "rgba(214, 206, 112, 0.85)" : "rgba(176, 145, 143, 0.75)"
            ),
          },
        ],
      },
      options: commonOptions({
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              precision: 0,
            },
          },
        },
      }),
    })
  );
}

function commonOptions(extra = {}) {
  const base = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 550,
    },
    plugins: {
      legend: {
        labels: {
          color: "#4b4f54",
          font: {
            family: "DM Sans",
            size: 12,
            weight: "600",
          },
        },
      },
      tooltip: {
        bodyFont: {
          family: "DM Sans",
        },
        titleFont: {
          family: "DM Sans",
        },
      },
    },
    scales: {
      x: {
        ticks: {
          color: "#60666d",
          font: {
            family: "DM Sans",
          },
        },
        grid: {
          color: "rgba(80, 80, 80, 0.08)",
        },
      },
      y: {
        ticks: {
          color: "#60666d",
          font: {
            family: "DM Sans",
          },
        },
        grid: {
          color: "rgba(80, 80, 80, 0.08)",
        },
      },
    },
  };

  return {
    ...base,
    ...extra,
    plugins: {
      ...base.plugins,
      ...extra.plugins,
      legend: {
        ...base.plugins.legend,
        ...(extra.plugins?.legend || {}),
        labels: {
          ...base.plugins.legend.labels,
          ...(extra.plugins?.legend?.labels || {}),
        },
      },
      tooltip: {
        ...base.plugins.tooltip,
        ...(extra.plugins?.tooltip || {}),
      },
    },
    scales: {
      ...base.scales,
      ...extra.scales,
      x: {
        ...base.scales.x,
        ...(extra.scales?.x || {}),
        ticks: {
          ...base.scales.x.ticks,
          ...(extra.scales?.x?.ticks || {}),
        },
        grid: {
          ...base.scales.x.grid,
          ...(extra.scales?.x?.grid || {}),
        },
      },
      y: {
        ...base.scales.y,
        ...(extra.scales?.y || {}),
        ticks: {
          ...base.scales.y.ticks,
          ...(extra.scales?.y?.ticks || {}),
        },
        grid: {
          ...base.scales.y.grid,
          ...(extra.scales?.y?.grid || {}),
        },
      },
    },
  };
}

async function saveReportImage() {
  if (resultsEl.classList.contains("hidden")) {
    return;
  }

  const originalText = saveImageBtnEl.textContent;
  saveImageBtnEl.disabled = true;
  saveImageBtnEl.textContent = "GENERATING...";

  try {
    const canvas = await html2canvas(reportCaptureEl, {
      backgroundColor: "#efefef",
      scale: 2,
      useCORS: true,
    });

    const dataUrl = canvas.toDataURL("image/png");
    const fileName = `whatsapp-stat-${formatFileStamp(new Date())}.png`;
    manualDownloadLinkEl.href = dataUrl;
    manualDownloadLinkEl.download = fileName;
    triggerDownload(dataUrl, fileName);
  } catch (error) {
    console.error(error);
  } finally {
    saveImageBtnEl.disabled = false;
    saveImageBtnEl.textContent = originalText;
  }
}

function triggerDownload(dataUrl, fileName) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function formatFileStamp(date) {
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}

function destroyCharts() {
  for (const chart of charts) {
    chart.destroy();
  }
  charts = [];
}

function extractEmojis(message) {
  const chars = message.match(/\p{Extended_Pictographic}/gu);
  return chars || [];
}

function indexOfMax(values) {
  let maxValue = values[0] ?? 0;
  let maxIndex = 0;
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] > maxValue) {
      maxValue = values[i];
      maxIndex = i;
    }
  }
  return maxIndex;
}

function colorList(length) {
  return Array.from({ length }, (_, idx) => CHART_COLORS[idx % CHART_COLORS.length]);
}

function hourRangeLabel(hour) {
  const start = hourTo12h(hour);
  const end = hourTo12h((hour + 1) % 24);
  return `${start}-${end}`;
}

function hourTo12h(hour) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const normalized = hour % 12 || 12;
  return `${normalized}${suffix}`;
}

function normalizeYear(year) {
  if (year < 100) {
    return year < 70 ? 2000 + year : 1900 + year;
  }
  return year;
}

function formatNum(value) {
  return new Intl.NumberFormat().format(value);
}
