const form = document.querySelector("#question-form");
const list = document.querySelector("#question-list");
const count = document.querySelector("#question-count");
const formMessage = document.querySelector("#form-message");
const libraryMessage = document.querySelector("#library-message");
const resultsEmpty = document.querySelector("#results-empty");
const resultsContent = document.querySelector("#results-content");
const resultsQuestion = document.querySelector("#results-question");
const resultsAnswers = document.querySelector("#results-answers");
const resultsTotalVotes = document.querySelector("#total-votes");
const resultsWaiting = document.querySelector("#results-waiting");
const resultsMessage = document.querySelector("#results-message");

let resultsTimer = null;
let resultsController = null;
let resultsRequestVersion = 0;
let lastResultsQuestionId = null;
let resultRows = [];

function showMessage(element, message) {
  element.textContent = message;
}

function appendText(parent, tagName, className, text) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
}

function renderQuestions(questions) {
  list.replaceChildren();
  count.textContent = String(questions.length);

  if (questions.length === 0) {
    appendText(list, "p", "empty-state", "No questions saved yet. Create your first question using the form.");
    return;
  }

  questions.forEach((question) => {
    const card = document.createElement("article");
    card.className = `question-item${question.active ? " is-active" : ""}`;

    const top = document.createElement("div");
    top.className = "question-item-top";
    appendText(top, "h3", "", question.question);
    if (question.active) appendText(top, "span", "active-badge", "ACTIVE");
    card.append(top);

    const choices = document.createElement("div");
    choices.className = "choice-list";
    question.options.forEach((option, index) => {
      appendText(choices, "span", "choice-chip", `${String.fromCharCode(65 + index)} · ${option}`);
    });
    card.append(choices);

    const activate = document.createElement("button");
    activate.className = "activate-button";
    activate.type = "button";
    activate.dataset.questionId = String(question.id);
    activate.disabled = question.active;
    activate.textContent = question.active ? "Currently active" : "Activate question";
    card.append(activate);
    list.append(card);
  });
}

function validateResults(data) {
  if (!data || typeof data !== "object" || !Number.isInteger(data.total_votes)) {
    throw new Error("The server returned an unexpected results response.");
  }
  if (data.active_question_id === null) {
    if (data.question !== null || !Array.isArray(data.answers) || data.answers.length !== 0 || data.total_votes !== 0) {
      throw new Error("The server returned an unexpected results response.");
    }
    return;
  }
  if (
    !Number.isInteger(data.active_question_id)
    || data.active_question_id < 1
    || typeof data.question !== "string"
    || !Array.isArray(data.answers)
    || data.answers.length !== 4
    || data.total_votes < 0
  ) {
    throw new Error("The server returned an unexpected results response.");
  }
  const answerVotes = data.answers.reduce((total, answer, index) => {
    if (
      answer.label !== String.fromCharCode(65 + index)
      || typeof answer.text !== "string"
      || !Number.isInteger(answer.votes)
      || answer.votes < 0
      || typeof answer.percentage !== "number"
      || !Number.isFinite(answer.percentage)
      || answer.percentage < 0
      || answer.percentage > 100
    ) {
      throw new Error("The server returned an unexpected results response.");
    }
    return total + answer.votes;
  }, 0);
  if (answerVotes !== data.total_votes) {
    throw new Error("The server returned an unexpected results response.");
  }
}

function makeResultRow(answer) {
  const row = document.createElement("article");
  row.className = "result-row";

  const top = document.createElement("div");
  top.className = "result-row-top";
  const answerLabel = document.createElement("div");
  answerLabel.className = "result-answer-label";
  const letter = appendText(answerLabel, "span", "result-letter", answer.label);
  const answerText = appendText(answerLabel, "span", "result-answer-text", answer.text);
  const stats = document.createElement("div");
  stats.className = "result-stats";
  const votes = appendText(
    stats,
    "strong",
    "result-votes",
    `${answer.votes} ${answer.votes === 1 ? "vote" : "votes"}`
  );
  const percentage = appendText(stats, "span", "result-percentage", `${answer.percentage}%`);
  top.append(answerLabel, stats);

  const track = document.createElement("div");
  track.className = "result-track";
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", "100");
  track.setAttribute("aria-valuenow", String(answer.percentage));
  track.setAttribute("aria-label", `${answer.label}: ${answer.percentage}%`);
  const fill = document.createElement("div");
  fill.className = "result-fill";
  fill.style.width = "0%";
  track.append(fill);
  row.append(top, track);
  return { element: row, letter, answerText, votes, percentage, track, fill };
}

function renderResults(data) {
  resultsMessage.textContent = "";
  if (data.active_question_id === null) {
    lastResultsQuestionId = null;
    resultRows = [];
    resultsAnswers.replaceChildren();
    resultsContent.hidden = true;
    resultsEmpty.hidden = false;
    return;
  }

  resultsEmpty.hidden = true;
  resultsContent.hidden = false;
  resultsQuestion.textContent = data.question;
  resultsTotalVotes.textContent = String(data.total_votes);
  resultsWaiting.hidden = data.total_votes !== 0;

  if (lastResultsQuestionId !== data.active_question_id) {
    resultsAnswers.replaceChildren();
    resultRows = data.answers.map((answer) => {
      const row = makeResultRow(answer);
      resultsAnswers.append(row.element);
      return row;
    });
    lastResultsQuestionId = data.active_question_id;
    const rowsForQuestion = resultRows;
    requestAnimationFrame(() => {
      if (
        lastResultsQuestionId !== data.active_question_id
        || resultRows !== rowsForQuestion
      ) {
        return;
      }
      data.answers.forEach((answer, index) => {
        rowsForQuestion[index].fill.style.width = `${answer.percentage}%`;
      });
    });
    return;
  }

  data.answers.forEach((answer, index) => {
    const row = resultRows[index];
    row.letter.textContent = answer.label;
    row.answerText.textContent = answer.text;
    row.votes.textContent = `${answer.votes} ${answer.votes === 1 ? "vote" : "votes"}`;
    row.percentage.textContent = `${answer.percentage}%`;
    row.track.setAttribute("aria-valuenow", String(answer.percentage));
    row.track.setAttribute("aria-label", `${answer.label}: ${answer.percentage}%`);
    row.fill.style.width = `${answer.percentage}%`;
  });
}

async function requestResults(questionId, signal) {
  const url = new URL("/api/results", window.location.origin);
  if (questionId !== null) url.searchParams.set("question_id", String(questionId));

  const response = await fetch(url, { signal, cache: "no-store" });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("The server returned an unexpected results response.");
  }

  if (questionId !== null && (response.status === 409 || response.status === 404)) {
    return null;
  }
  if (!response.ok) {
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : "Live results could not be loaded."
    );
  }
  validateResults(data);
  return data;
}

function stopResultsPolling() {
  resultsRequestVersion += 1;
  if (resultsTimer !== null) {
    clearTimeout(resultsTimer);
    resultsTimer = null;
  }
  if (resultsController) {
    resultsController.abort();
    resultsController = null;
  }
}

async function pollResults() {
  if (resultsTimer !== null) {
    clearTimeout(resultsTimer);
    resultsTimer = null;
  }
  if (resultsController) resultsController.abort();

  const requestVersion = ++resultsRequestVersion;
  const controller = new AbortController();
  resultsController = controller;

  try {
    let data = await requestResults(lastResultsQuestionId, controller.signal);
    if (requestVersion !== resultsRequestVersion) return;
    if (data === null) {
      data = await requestResults(null, controller.signal);
      if (requestVersion !== resultsRequestVersion) return;
    }
    renderResults(data);
  } catch (error) {
    if (error.name !== "AbortError" && requestVersion === resultsRequestVersion) {
      resultsMessage.textContent = "Live results are temporarily unavailable. Reconnecting…";
    }
  } finally {
    if (requestVersion === resultsRequestVersion) {
      resultsController = null;
      resultsTimer = setTimeout(pollResults, 2000);
    }
  }
}

async function loadQuestions() {
  showMessage(libraryMessage, "");
  try {
    const response = await fetch("/api/questions");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load saved questions.");
    renderQuestions(data);
  } catch (error) {
    showMessage(libraryMessage, error.message || "Could not load saved questions. Please try again.");
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage(formMessage, "");

  const formData = new FormData(form);
  const payload = {
    question: formData.get("question"),
    options: [0, 1, 2, 3].map((index) => formData.get(`option-${index}`)),
  };
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;

  try {
    const response = await fetch("/api/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not save the question.");
    form.reset();
    showMessage(formMessage, "Question saved to your library.");
    await loadQuestions();
  } catch (error) {
    showMessage(formMessage, error.message || "Could not save the question. Please try again.");
  } finally {
    submitButton.disabled = false;
  }
});

list.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-question-id]");
  if (!button) return;

  stopResultsPolling();
  showMessage(libraryMessage, "");
  button.disabled = true;
  try {
    const response = await fetch(`/api/questions/${button.dataset.questionId}/activate`, {
      method: "POST",
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not activate that question.");
    await loadQuestions();
    await pollResults();
  } catch (error) {
    button.disabled = false;
    showMessage(libraryMessage, error.message || "Could not activate that question. Please try again.");
    await pollResults();
  }
});

loadQuestions();
pollResults();