import mongoose from 'mongoose'

const submissionSchema = new mongoose.Schema(
    {
        jobID:{
            type: String,
            required: true,
            unique: true,
            index: true
        },
        language:{
            type: String,
            required: true
        },
        srcCode:{
            type: String,
            required: true,
        },
        stdin:{
            type: String,
            default: ''
        },
        status:{
            type: String,
            enum: ['QUEUED', 'COMPLETED', 'PROCESSING', 'TIME-LIMIT-EXCEEDED', 'MEMORY-LIMIT-EXCEEDED', 'RUNTIME-ERROR', 'COMPILATION-ERROR'],
            default: "PENDING"
        },
        metrics:{
            executionTime: {type: Number, default: null},
            memoryUsage: {type: Number, default: null}
        },
        stdout: {type: String, default: ""},
        stderr: {type: String, default: ""},

    },
    {timestamps:true}
)

export const Submission = mongoose.model('Submission', submissionSchema)