
from threading import Lock

from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

questions = [
    {
        "id": 1,
        "question": "What is the capital of France?",
        "options": ["London", "Paris", "Rome", "Berlin"],
        "votes": [0, 0, 0, 0],
        "active": False,
    }
]
active_question_id = None
votes_by_question = {}
vote_lock = Lock()

@app.route("/")
def home():
    return render_template("index.html")


@app.route("/teacher")
def teacher_dashboard():
    return render_template("teacher.html")


@app.route("/student")
def student_page():
    return render_template("student.html")

@app.route("/api/questions")
def get_questions():
    with vote_lock:
        return jsonify(questions)


@app.route("/api/results")
def get_active_results():
    requested_id = request.args.get("question_id")
    if requested_id is not None:
        try:
            requested_id = int(requested_id)
        except ValueError:
            return jsonify({"error": "Question ID must be a positive integer."}), 400
        if requested_id < 1:
            return jsonify({"error": "Question ID must be a positive integer."}), 400

    with vote_lock:
        if requested_id is not None:
            requested_question = next(
                (item for item in questions if item["id"] == requested_id), None
            )
            if requested_question is None:
                return jsonify({"error": "That question could not be found."}), 404

        if active_question_id is None:
            if requested_id is not None:
                return jsonify({
                    "error": "There is no active question.",
                    "active_question_id": None,
                }), 409
            result = {
                "active_question_id": None,
                "question": None,
                "answers": [],
                "total_votes": 0,
            }
        else:
            if requested_id is not None and requested_id != active_question_id:
                return jsonify({
                    "error": "The active question has changed.",
                    "active_question_id": active_question_id,
                }), 409

            active_question = next(
                (item for item in questions if item["id"] == active_question_id), None
            )
            if active_question is None:
                return jsonify({
                    "error": "The active question could not be found.",
                    "active_question_id": None,
                }), 404

            votes = active_question["votes"]
            total_votes = sum(votes)
            answers = [
                {
                    "label": chr(ord("A") + index),
                    "text": option,
                    "votes": vote_count,
                    "percentage": (
                        round(vote_count * 100 / total_votes, 1)
                        if total_votes
                        else 0
                    ),
                }
                for index, (option, vote_count) in enumerate(
                    zip(active_question["options"], votes)
                )
            ]
            result = {
                "active_question_id": active_question["id"],
                "question": active_question["question"],
                "answers": answers,
                "total_votes": total_votes,
            }

    response = jsonify(result)
    response.headers["Cache-Control"] = "no-store"
    return response


@app.route("/api/questions", methods=["POST"])
def create_question():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Please submit a valid question form."}), 400

    question_text = data.get("question")
    options = data.get("options")
    if not isinstance(question_text, str) or not question_text.strip():
        return jsonify({"error": "Enter a question before saving."}), 400
    question_text = question_text.strip()
    if len(question_text) > 300:
        return jsonify({"error": "Keep the question under 300 characters."}), 400
    if not isinstance(options, list) or len(options) != 4:
        return jsonify({"error": "Add exactly four answer choices."}), 400

    if any(not isinstance(option, str) or not option.strip() for option in options):
        return jsonify({"error": "Fill in all four answer choices."}), 400
    clean_options = [option.strip() for option in options]
    if any(len(option) > 150 for option in clean_options):
        return jsonify({"error": "Keep each answer choice under 150 characters."}), 400
    if len({option.casefold() for option in clean_options}) != 4:
        return jsonify({"error": "Each answer choice must be different."}), 400

    with vote_lock:
        new_question = {
            "id": max((item["id"] for item in questions), default=0) + 1,
            "question": question_text,
            "options": clean_options,
            "votes": [0, 0, 0, 0],
            "active": False,
        }
        questions.append(new_question)
    return jsonify(new_question), 201


@app.route("/api/questions/<int:question_id>/activate", methods=["POST"])
def activate_question(question_id):
    global active_question_id

    with vote_lock:
        selected_question = next(
            (item for item in questions if item["id"] == question_id), None
        )
        if selected_question is None:
            return jsonify({"error": "That question could not be found."}), 404

        active_question_id = question_id
        for item in questions:
            item["active"] = item["id"] == active_question_id
    return jsonify(selected_question)


@app.route("/api/vote", methods=["POST"])
def submit_vote():
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "Please submit a valid vote."}), 400

    voter_id = data.get("voter_id")
    option_index = data.get("option_index")
    question_id = data.get("question_id")
    if (
        not isinstance(voter_id, str)
        or not voter_id.strip()
        or len(voter_id) > 100
    ):
        return jsonify({
            "error": "Your browser could not be identified. Refresh and try again."
        }), 400
    if not isinstance(option_index, int) or isinstance(option_index, bool):
        return jsonify({"error": "Choose one of the answer choices before submitting."}), 400
    if not isinstance(question_id, int) or isinstance(question_id, bool) or question_id < 1:
        return jsonify({"error": "The poll changed. Please choose an answer for the current question."}), 400

    with vote_lock:
        if question_id != active_question_id:
            return jsonify({
                "error": "The active poll changed. Please choose an answer for the current question.",
                "active_question_id": active_question_id,
            }), 409

        active_question = next(
            (item for item in questions if item["id"] == active_question_id), None
        )
        if active_question is None:
            return jsonify({"error": "There is no active poll right now."}), 409
        if option_index < 0 or option_index >= len(active_question["options"]):
            return jsonify({"error": "That answer choice is not available."}), 400

        voters = votes_by_question.setdefault(active_question_id, set())
        if voter_id in voters:
            return jsonify({"error": "Your vote has already been recorded for this question."}), 409

        voters.add(voter_id)
        active_question["votes"][option_index] += 1
        voted_question_id = active_question_id

    return jsonify({
        "message": "Your vote has been recorded.",
        "question_id": voted_question_id,
    })


if __name__ == "__main__":
    app.run(debug=True)
