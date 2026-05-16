const express = require("express");
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const cors = require("cors");
const axios = require("axios");

dotenv.config();

const app = express();

app.use(express.json());
app.use(cors({
    origin: "*"
}));

/* ======================================
   DATABASE CONNECTION
====================================== */

mongoose.connect(process.env.MONGO_URI)
.then(() => {
    console.log("MongoDB Connected");
})
.catch((err) => {
    console.log(err);
});

/* ======================================
   SCHEMA
====================================== */

const candidateSchema = new mongoose.Schema({

    name: {
        type: String,
        required: true
    },

    email: {
        type: String,
        required: true
    },

    skills: {
        type: [String],
        required: true
    },

    experience: {
        type: Number,
        required: true
    },

    bio: {
        type: String,
        default: ""
    },

    shortlisted: {
        type: Boolean,
        default: false
    },

    createdAt: {
        type: Date,
        default: Date.now
    }

});

const Candidate = mongoose.model("Candidate", candidateSchema);

/* ======================================
   HOME ROUTE
====================================== */

app.get("/", (req, res) => {

    res.send("Candidate Shortlisting API Running");

});

/* ======================================
   ADD CANDIDATE
====================================== */

app.post("/api/candidates", async (req, res) => {

    try {

        const candidate = new Candidate(req.body);

        await candidate.save();

        res.status(201).json({
            success: true,
            message: "Candidate Added Successfully",
            candidate
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            error: error.message
        });

    }

});

/* ======================================
   GET ALL CANDIDATES
====================================== */

app.get("/api/candidates", async (req, res) => {

    try {

        const candidates = await Candidate.find();

        res.json({
            success: true,
            count: candidates.length,
            candidates
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            error: error.message
        });

    }

});

/* ======================================
   SEARCH CANDIDATES BY SKILL
====================================== */

app.get("/api/candidates/search/:skill", async (req, res) => {

    try {

        const skill = req.params.skill;

        const candidates = await Candidate.find({
            skills: {
                $regex: skill,
                $options: "i"
            }
        });

        res.json({
            success: true,
            candidates
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            error: error.message
        });

    }

});

/* ======================================
   BASIC MATCHING LOGIC
====================================== */

function matchCandidates(candidates, job) {

    return candidates.map(candidate => {

        /* =========================
           REQUIRED SKILLS MATCH
        ========================= */

        const matchedSkills = candidate.skills.filter(skill =>
            job.requiredSkills
                .map(s => s.toLowerCase())
                .includes(skill.toLowerCase())
        );

        /* =========================
           PREFERRED SKILLS MATCH
        ========================= */

        const preferredMatched = candidate.skills.filter(skill =>
            job.preferredSkills
                ?.map(s => s.toLowerCase())
                .includes(skill.toLowerCase())
        );

        /* =========================
           SCORE CALCULATION
        ========================= */

        const skillScore =
            (matchedSkills.length / job.requiredSkills.length) * 100;

        const preferredScore =
            preferredMatched.length * 10;

        const experienceScore =
            candidate.experience >= job.minExperience
                ? 20
                : 0;

        const totalScore =
            skillScore +
            preferredScore +
            experienceScore;

        /* =========================
           RANKING
        ========================= */

        let ranking = "Low";

        if (totalScore >= 100) {

            ranking = "High";

        }
        else if (totalScore >= 50) {

            ranking = "Medium";

        }

        return {

            name: candidate.name,

            email: candidate.email,

            skills: candidate.skills,

            experience: candidate.experience,

            bio: candidate.bio,

            matchedSkills,

            preferredMatched,

            matchScore: totalScore,

            ranking

        };

    })

    .sort((a, b) => b.matchScore - a.matchScore);

}

/* ======================================
   BASIC SHORTLIST API
====================================== */

app.post("/api/match", async (req, res) => {

    try {

        const job = req.body;

        const candidates = await Candidate.find();

        const results = matchCandidates(candidates, job);

        res.json({
            success: true,
            totalCandidates: results.length,
            shortlistedCandidates: results
        });

    } catch (error) {

        res.status(500).json({
            success: false,
            error: error.message
        });

    }

});

/* ======================================
   AI SHORTLIST API
====================================== */

app.post("/api/ai/shortlist", async (req, res) => {

    try {

        const {
            requiredSkills,
            preferredSkills,
            minExperience
        } = req.body;

        const candidates = await Candidate.find();

        const candidateText = candidates.map((c, index) => `

${index + 1}. ${c.name}

Skills: ${c.skills.join(", ")}

Experience: ${c.experience} years

Bio: ${c.bio}

`).join("\n");

        const prompt = `

Job Skills: ${requiredSkills.join(", ")}

Minimum Experience: ${minExperience} years

Candidates:
${candidateText}

Return ONLY top 3 candidates.

Response format exactly:

1. Name - one short reason
2. Name - one short reason
3. Name - one short reason

Maximum 3 lines only.

`;

        const response = await axios.post(

            "https://openrouter.ai/api/v1/chat/completions",

            {
   model: "openai/gpt-4o-mini",

   temperature: 0.2,

   max_tokens: 40,

   messages: [
      {
         role: "user",
         content: prompt
      }
   ]
},

            {
                headers: {

                    Authorization:
                        `Bearer ${process.env.OPENROUTER_API_KEY}`,

                    "Content-Type": "application/json"

                }
            }

        );

        res.json({

            success: true,

            aiRecommendation:
                response.data.choices[0].message.content

        });

    } catch (error) {

        console.log(error.response?.data || error.message);

        res.status(500).json({

            success: false,

            message: "AI Shortlisting Failed",

            error: error.response?.data || error.message

        });

    }

});

/* ======================================
   AI INTERVIEW QUESTIONS API
====================================== */

app.post("/api/ai/interview", async (req, res) => {

    try {

        const { skills } = req.body;

        const prompt = `

Generate 5 technical interview questions for:

${skills.join(", ")}

`;

        const response = await axios.post(

            "https://openrouter.ai/api/v1/chat/completions",

            {
                model: "openai/gpt-4o-mini",

                messages: [
                    {
                        role: "user",
                        content: prompt
                    }
                ]
            },

            {
                headers: {

                    Authorization:
                        `Bearer ${process.env.OPENROUTER_API_KEY}`,

                    "Content-Type": "application/json"

                }
            }

        );

        res.json({

            success: true,

            questions:
                response.data.choices[0].message.content

        });

    } catch (error) {

        console.log(error.response?.data || error.message);

        res.status(500).json({

            success: false,

            error: error.response?.data || error.message

        });

    }

});

/* ======================================
   SAVE SHORTLISTED CANDIDATE
====================================== */

app.put("/api/candidates/:id/shortlist", async (req, res) => {

    try {

        const updatedCandidate = await Candidate.findByIdAndUpdate(

            req.params.id,

            {
                shortlisted: true
            },

            {
                new: true
            }

        );

        res.json({

            success: true,

            message: "Candidate Shortlisted",

            candidate: updatedCandidate

        });

    } catch (error) {

        res.status(500).json({

            success: false,

            error: error.message

        });

    }

});

/* ======================================
   GET SHORTLISTED CANDIDATES
====================================== */

app.get("/api/shortlisted", async (req, res) => {

    try {

        const candidates = await Candidate.find({
            shortlisted: true
        });

        res.json({

            success: true,

            candidates

        });

    } catch (error) {

        res.status(500).json({

            success: false,

            error: error.message

        });

    }

});

/* ======================================
   DELETE CANDIDATE
====================================== */

app.delete("/api/candidates/:id", async (req, res) => {

    try {

        await Candidate.findByIdAndDelete(req.params.id);

        res.json({

            success: true,

            message: "Candidate Deleted"

        });

    } catch (error) {

        res.status(500).json({

            success: false,

            error: error.message

        });

    }

});

/* ======================================
   SERVER
====================================== */

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {

    console.log(`Server running on port ${PORT}`);

});