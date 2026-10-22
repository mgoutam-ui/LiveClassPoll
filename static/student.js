const loadingState = document.querySelector("#student-loading");
const waitingState = document.querySelector("#waiting-state");
const votingState = document.querySelector("#voting-state");
const votedState = document.querySelector("#voted-state");
const errorState = document.querySelector("#student-error");
const errorMessage = document.querySelector("#student-error-message");
const questionHeading = document.querySelector("#active-question");
const answerOptions = document.querySelector("#answer-options");
const voteForm = document.querySelector("#vote-form");
const voteMessage = document.querySelector("#vote-message");
const submitButton = document.querySelector("#submit-vote");
const pollUpdateMessage = document.querySelector("#poll-update-message");
const voterStorageKey = "classpulse-session-voter-id";
const votedStorageKey = "classpulse-session-votes";
let activeQuestionId = null;
let pollTimer = null;
let pollController = null;
let pollRequestVersion = 0;
let hasLoadedPoll = false;

function getVoterId() {
  let voterId = sessionStorage.getItem(voterStorageKey);
  if (!voterId) {
    voterId = crypto.randomUUID();
    sessionStorage.setItem(voterStorageKey, voterId);
  }
  return voterId;
}

function showState(state) {
  [loadingState, waitingState, votingState, votedState, errorState].forEach((element) => {
    element.hidden = element !== state;
  });
}

function getSavedVote(questionId) {
  const savedVotes = JSON.parse(sessionStorage.getItem(votedStorageKey) || "{}");
  return savedVotes[String(questionId)] === true;
}

function saveVote(questionId) {
  const savedVotes = JSON.parse(sessionStorage.getItem(votedStorageKey) || "{}");
  savedVotes[String(questionId)] = true;
  sessionStorage.setItem(votedStorageKey, JSON.stringify(savedVotes));
}

function displayActiveQuestion(question) {
  activeQuestionId = question.id;
  questionHeading.textContent = question.question;
  answerOptions.replaceChildren();
  const legend = document.createElement("legend");
  legend.className = "field-label";
  legend.textContent = "Select one answer";
  answerOptions.append(legend);

  question.options.forEach((option, index) => {
    const label = document.createElement("label");
    label.className = "student-option";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "option-index";
    input.value = String(index);
    input.required = true;
    const letter = document.createElement("span");
    letter.className = "student-option-letter";
    letter.textContent = String.fromCharCode(65 + index);
    const text = document.createElement("span");
    text.className = "student-option-text";
    text.textContent = option;
    label.append(input, letter, text);
    answerOptions.append(label);
  });

  voteForm.dataset.questionId = String(question.id);
  voteForm.reset();
  voteMessage.textContent = "";
  pollUpdateMessage.textContent = "";
  showState(getSavedVote(question.id) ? votedState : votingState);
}

function displayWaiting() {
  activeQuestionId = null;
  voteForm.removeAttribute("data-question-id");
  showState(waitingState);
}

function schedulePoll() {
  if (pollTimer !== null) clearTimeout(pollTimer);
  pollTimer = setTimeout(pollActiveQuestion, 2000);
}

async function pollActiveQuestion() {
  if (pollTimer !== null) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  if (pollController) pollController.abort();
  const requestVersion = ++pollRequestVersion;
  const controller = new AbortController();
  pollController = controller;

  try {
    const response = await fetch("/api/questions", {
      signal: controller.signal,
      cache: "no-store",
    });
    const questions = await response.json();
    if (!response.ok) throw new Error(questions.error || "Please try again in a moment.");
    if (!Array.isArray(questions)) {
      throw new Error("The server returned an unexpected poll response.");
    }

    const question = questions.find((item) => item.active);
    if (requestVersion !== pollRequestVersion) return;
    if (!question) {
      displayWaiting();
      hasLoadedPoll = true;
      return;
    }
    if (
      !Number.isInteger(question.id)
      || typeof question.question !== "string"
      || !Array.isArray(question.options)
      || question.options.length !== 4
      || question.options.some((option) => typeof option !== "string")
    ) {
      throw new Error("The server returned an unexpected poll response.");
    }

    if (question.id !== activeQuestionId || !hasLoadedPoll) {
      displayActiveQuestion(question);
    }
    hasLoadedPoll = true;
  } catch (error) {
    if (error.name !== "AbortError" && requestVersion === pollRequestVersion) {
      const message = "Connection interrupted. Checking for the current poll…";
      if (!hasLoadedPoll) {
        errorMessage.textContent = message;
        showState(errorState);
      } else {
        pollUpdateMessage.textContent = message;
      }
    }
  } finally {
    if (requestVersion === pollRequestVersion) {
      pollController = null;
      schedulePoll();
    }
  }
}

voteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  voteMessage.textContent = "";
  const selected = voteForm.querySelector('input[name="option-index"]:checked');
  if (!selected) {
    voteMessage.textContent = "Choose an answer before submitting your vote.";
    return;
  }

  submitButton.disabled = true;
  try {
    const response = await fetch("/api/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        voter_id: getVoterId(),
        question_id: Number(voteForm.dataset.questionId),
        option_index: Number(selected.value),
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Your vote could not be submitted.");
    saveVote(data.question_id);
    if (activeQuestionId === data.question_id) showState(votedState);
    await pollActiveQuestion();
  } catch (error) {
    voteMessage.textContent = error.message || "Your vote could not be submitted. Please try again.";
    if (error.message && error.message.includes("already been recorded")) {
      saveVote(Number(voteForm.dataset.questionId));
      showState(votedState);
    } else if (error.message && error.message.includes("active poll changed")) {
      await pollActiveQuestion();
    }
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelector("#refresh-poll").addEventListener("click", pollActiveQuestion);
document.querySelector("#retry-poll").addEventListener("click", pollActiveQuestion);

pollActiveQuestion();