import { SURVEY_SECTIONS } from "./questions.js";

const MONTHS = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월", "차이없음"];

function cleanText(text) {
  return text ? String(text).replace(/\[cite:[^\]]*\]/g, "").trim() : "";
}

function escapeHtml(value) {
  if (value == null) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function optionLabel(options, value) {
  const opt = (options || []).find(item => String(item.v ?? item) === String(value));
  if (!opt) return value === undefined ? "미응답" : String(value);
  return cleanText(opt.l ?? opt);
}

function yesNoLabel(value) {
  if (value === undefined || value === null || value === "") return "미응답";
  return Number(value) === 1 ? "예" : "아니오";
}

function pushRow(rows, question, answer) {
  rows.push(`<tr><td>${escapeHtml(cleanText(question))}</td><td>${escapeHtml(answer)}</td></tr>`);
}

function renderQuestionRows(section, question, answers) {
  const rows = [];

  if (section.type === "matrix_complex" && question.id !== "mssi21") {
    const yn = answers[`${question.id}_yn`];
    const answer = Number(yn) === 1
      ? `예 / 빈도: ${optionLabel(section.options?.[0]?.opts, answers[`${question.id}_freq`])} / 심각도: ${optionLabel(section.options?.[1]?.opts, answers[`${question.id}_sev`])}`
      : yesNoLabel(yn);
    pushRow(rows, question.text, answer);
    return rows;
  }

  if (question.type === "matrix_months") {
    (question.rows || []).forEach((rowText, rowIndex) => {
      const selected = MONTHS.filter((_, monthIndex) => answers[`${question.id}_r${rowIndex}_m${monthIndex}`] === 1);
      pushRow(rows, rowText, selected.length ? selected.join(", ") : "미응답");
    });
    return rows;
  }

  if (question.type === "scale_matrix") {
    (question.rows || []).forEach((rowText, rowIndex) => {
      const key = `${question.id}_${rowIndex}`;
      pushRow(rows, rowText, optionLabel(question.options, answers[key]));
    });
    return rows;
  }

  if (question.type === "matrix_season_sleep") {
    (question.rows || []).forEach((rowText, rowIndex) => {
      const value = answers[`${question.id}_${rowIndex}`];
      pushRow(rows, rowText, value === undefined ? "미응답" : `${value}시간`);
    });
    return rows;
  }

  if (question.type === "custom_mdq") {
    (question.questions || []).forEach(subQuestion => {
      const opts = subQuestion.options?.length ? subQuestion.options : [{ v: 1, l: "예" }, { v: 0, l: "아니오" }];
      pushRow(rows, subQuestion.text, optionLabel(opts, answers[subQuestion.id]));
    });
    return rows;
  }

  if (question.type === "yesno_with_sub") {
    const main = answers[question.id];
    pushRow(rows, question.text, yesNoLabel(main));
    if (Number(main) === 1 && question.subQuestion) {
      pushRow(rows, question.subQuestion.text, optionLabel(question.subQuestion.options, answers[question.subQuestion.id]));
    }
    return rows;
  }

  const options = (section.type === "matrix_complex" && question.id === "mssi21")
    ? [{ v: 1, l: "예" }, { v: 0, l: "아니오" }]
    : (question.options || section.options || [{ v: 1, l: "예" }, { v: 0, l: "아니오" }]);
  pushRow(rows, question.text, optionLabel(options, answers[question.id]));
  return rows;
}

export function renderAnswerRawHTML(answers = {}) {
  const sections = SURVEY_SECTIONS.map(section => {
    const rows = [];
    if (section.id === "pms") {
      const labels = {
        pre_menopause: "초경 이후이며 폐경 전인 여성",
        not_menstruating: "초경 전이거나 폐경 후인 여성",
        male: "남성"
      };
      pushRow(rows, "PMS 문항 적용 구분", labels[answers.pms_applicability] || "미응답");
    }
    rows.push(...(section.questions || [])
      .filter(question => question.type !== "info")
      .flatMap(question => renderQuestionRows(section, question, answers)));
    if (!rows.length) return "";
    return `
      <details class="raw-answer-section">
        <summary>${escapeHtml(cleanText(section.title))}</summary>
        <div class="result-table-wrap">
          <table class="result-table raw-answer-table">
            <thead><tr><th>문항</th><th>응답</th></tr></thead>
            <tbody>${rows.join("")}</tbody>
          </table>
        </div>
      </details>`;
  }).join("");

  return `
    <details class="raw-answer-view">
      <summary>응답 원본 보기</summary>
      ${sections}
    </details>`;
}
