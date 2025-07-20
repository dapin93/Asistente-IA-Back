import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { dirname } from "path";
import cors from "cors";
import dotenv from "dotenv";
import voice from "elevenlabs-node";
import express from "express";
import { promises as fs } from "fs";
import OpenAI from "openai";
import { promisify } from "util";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const execPromise = promisify(exec);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "-",
});

const elevenLabsApiKey = process.env.ELEVEN_LABS_API_KEY;
const voiceID = "86V9x9hrQds83qf7zaGn";

const app = express();
app.use(express.json());
app.use(cors());
const port = 3000;

// Base de datos falsa (mock) para estudiantes, docentes, administrativos y horarios
const mockDatabase = {
  students: {
    "EST001": {
      name: "Juan Perez",
      code: "EST001",
      career: "Ingeniería de Sistemas",
      semester: 5,
      grades: { "Matemáticas": 4.5, "Programación": 3.8 },
      schedule: ["Lunes: Matemáticas 8am", "Miércoles: Programación 10am"]
    },
    "EST002": {
      name: "Maria Lopez",
      code: "EST002",
      career: "Bioingeniería",
      semester: 3,
      grades: { "Biología": 4.2, "Física": 4.0 },
      schedule: ["Martes: Biología 9am", "Jueves: Física 11am"]
    },
    // Agrega más estudiantes según necesites
  },
  teachers: {
    "DOC001": {
      name: "Dr. Carlos Ramirez",
      code: "DOC001",
      department: "Ingeniería",
      courses: ["Programación", "Algoritmos"],
      schedule: ["Lunes: Programación 10am", "Miércoles: Algoritmos 2pm"]
    },
    "DOC002": {
      name: "Prof. Ana Torres",
      code: "DOC002",
      department: "Biología",
      courses: ["Biología General", "Bioquímica"],
      schedule: ["Martes: Biología 8am", "Jueves: Bioquímica 1pm"]
    },
    // Agrega más docentes
  },
  admins: {
    "ADM001": {
      name: "Admin Sofia Gomez",
      code: "ADM001",
      role: "Coordinadora Académica",
      formats: [
        { name: "Matrícula Académica Extraordinaria", url: "/formats/R-GA001_V12_FORMATO_MATRCULA_ACADMICA_EXTRAORDINARIA-12.pdf" },
        { name: "Modificación de Matrícula Académica", url: "/formats/R-GA002_V10_FORMATO_MODIFICACION_MATRICULA_ACADEMICA.pdf" },
        { name: "Solicitud de Pruebas y Exámenes", url: "/formats/R-GA003_V9_FORMATO_SOLICITUD_PRUEBAS_Y_EXAMENES.pdf" },
        { name: "Cancelación de Semestre", url: "/formats/R-GA004_V7_FORMATO_DE_CANCELACION_DE_SEMESTRE.pdf" },
        { name: "Solicitud de Liquidación de Recibo Matrícula Parcial", url: "/formats/R-GA005_V8_FORMATO_SOLICITUD_LIQUIDACION_DE_RECIBO_MATRCULA_PARCIAL.pdf" }
      ]
    },
    // Agrega más administrativos si necesitas, ej.
    "ADM002": {
      name: "Admin Juan Martinez",
      code: "ADM002",
      role: "Jefe de Registro",
      formats: [
        // Asigna subsets de PDFs si quieres diferenciar roles
        { name: "Cancelación de Semestre", url: "/formats/R-GA004_V7_FORMATO_DE_CANCELACION_DE_SEMESTRE.pdf" },
        { name: "Solicitud de Pruebas y Exámenes", url: "/formats/R-GA003_V9_FORMATO_SOLICITUD_PRUEBAS_Y_EXAMENES.pdf" }
      ]
    }
  },
  schedules: {
    "general": [
      { day: "Lunes", classes: ["Matemáticas 8am - EST001", "Programación 10am - DOC001"] },
      // Agrega horarios generales
    ]
  }
};

// Ruta para servir formatos descargables (agrega archivos PDF en una carpeta 'formats')
app.use('/formats', express.static(path.join(__dirname, 'formats')));

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/voices", async (req, res) => {
  res.send(await voice.getVoices(elevenLabsApiKey));
});

const lipSyncMessage = async (message) => {
  const time = new Date().getTime();
  console.log(`Starting conversion for message ${message}`);

  const mp3Path = path.join(__dirname, 'audios', `message_${message}.mp3`);
  const wavPath = path.join(__dirname, 'audios', `message_${message}.wav`);
  const jsonPath = path.join(__dirname, 'audios', `message_${message}.json`);
  const rhubarbPath = path.join(__dirname, 'bin', 'rhubarb.exe');

  // Conversión MP3 → WAV
  await execPromise(`ffmpeg -y -i "${mp3Path}" "${wavPath}"`);
  console.log(`Conversion done in ${new Date().getTime() - time}ms`);

  // Generar lip sync JSON
  await execPromise(`"${rhubarbPath}" -f json -o "${jsonPath}" "${wavPath}" -r phonetic`);
  console.log(`Lip sync done in ${new Date().getTime() - time}ms`);
};

// Función para leer datos de archivos .md (RAG simple: carga todos los MD en una carpeta 'data')
async function loadMDData() {
  const dataDir = path.join(__dirname, 'data'); // Carpeta con archivos .md
  const files = await fs.readdir(dataDir);
  let mdContent = '';
  for (const file of files) {
    if (file.endsWith('.md')) {
      const content = await fs.readFile(path.join(dataDir, file), 'utf-8');
      mdContent += `\n\n---\n${file}:\n${content}`;
    }
  }
  return mdContent;
}

const mdKnowledgeBase = await loadMDData(); // Carga los .md al inicio

app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;
  if (!userMessage) {
    res.send({
      messages: [
        {
          text: "Hey dear... How was your day?",
          audio: await audioFileToBase64("audios/intro_0.wav"),
          lipsync: await readJsonTranscript("audios/intro_0.json"),
          facialExpression: "smile",
          animation: "Talking_1",
        },
        {
          text: "I missed you so much... Please don't go for so long!",
          audio: await audioFileToBase64("audios/intro_1.wav"),
          lipsync: await readJsonTranscript("audios/intro_1.json"),
          facialExpression: "sad",
          animation: "Crying",
        },
      ],
    });
    return;
  }

  if (!elevenLabsApiKey || openai.apiKey === "-") {
    res.send({
      messages: [
        {
          text: "Por favor ¡no olvides añadir tus claves API!",
          audio: await audioFileToBase64("audios/api_0.wav"),
          lipsync: await readJsonTranscript("audios/api_0.json"),
          facialExpression: "angry",
          animation: "Angry",
        },
        {
          text: "No querrás arruinarte con una factura desorbitada de ChatGPT y ElevenLabs, ¿verdad?",
          audio: await audioFileToBase64("audios/api_1.wav"),
          lipsync: await readJsonTranscript("audios/api_1.json"),
          facialExpression: "smile",
          animation: "Laughing",
        },
      ],
    });
    return;
  }

  // Lógica para consultar DB mock basada en la query
  let dbResponse = '';
  const lowerMessage = userMessage.toLowerCase();

  if (lowerMessage.includes('estudiante') || lowerMessage.includes('codigo est')) {
    const code = userMessage.match(/est(\d+)/i)?.[0].toUpperCase(); // Extrae código como EST001
    if (code && mockDatabase.students[code]) {
      const student = mockDatabase.students[code];
      dbResponse = `Estudiante: ${student.name}. Carrera: ${student.career}. Semestre: ${student.semester}. Notas: ${JSON.stringify(student.grades)}. Horario: ${student.schedule.join(', ')}.`;
    } else {
      dbResponse = 'Estudiante no encontrado.';
    }
  } else if (lowerMessage.includes('docente') || lowerMessage.includes('codigo doc')) {
    const code = userMessage.match(/doc(\d+)/i)?.[0].toUpperCase();
    if (code && mockDatabase.teachers[code]) {
      const teacher = mockDatabase.teachers[code];
      dbResponse = `Docente: ${teacher.name}. Departamento: ${teacher.department}. Cursos: ${teacher.courses.join(', ')}. Horario: ${teacher.schedule.join(', ')}.`;
    } else {
      dbResponse = 'Docente no encontrado.';
    }
  } else if (lowerMessage.includes('administrativo') || lowerMessage.includes('codigo adm')) {
    const code = userMessage.match(/adm(\d+)/i)?.[0].toUpperCase();
    if (code && mockDatabase.admins[code]) {
      const admin = mockDatabase.admins[code];
      dbResponse = `Administrativo: ${admin.name}. Rol: ${admin.role}. Formatos disponibles: ${admin.formats.map(f => `${f.name} - Descarga: ${f.url}`).join(', ')}.`;
    } else {
      dbResponse = 'Administrativo no encontrado.';
    }
  } else if (lowerMessage.includes('horario')) {
    dbResponse = `Horarios generales: ${JSON.stringify(mockDatabase.schedules.general)}.`;
  }

  // Prompt para OpenAI: Integra MD knowledge, DB mock y query
  const completion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo-1106",
    max_tokens: 1000,
    temperature: 0.6,
    response_format: {
      type: "json_object",
    },
    messages: [
      {
        role: "system",
        content: `
        You are a virtual university assistant.
        Usa esta base de conocimiento de archivos .md para responder: ${mdKnowledgeBase.substring(0, 2000)}... (resumido).
        Usa esta DB mock para info específica: ${JSON.stringify(mockDatabase)}.
        Si la query menciona códigos o entidades de la DB, úsalos para responder.
        Para administrativos, incluye links a formatos descargables.
        Para aspirantes sin código, responde preguntas generales sobre interés en la universidad o carreras usando la info de .md (currículos, costos, perfiles).
        Siempre responde con un JSON array de messages (máx 3). Cada message tiene text, facialExpression, animation.
        Facial expressions: smile, sad, angry, surprised, funnyFace, default.
        Animations: Talking_0, Talking_1, Talking_2, Crying, Laughing, Rumba, Idle, Terrified, Angry.
        Integra info de MD y DB en el text de forma natural.
        `,
      },
      {
        role: "user",
        content: `${userMessage}. DB info relevante: ${dbResponse}`,
      },
    ],
  });

  let messages = JSON.parse(completion.choices[0].message.content);
  if (messages.messages) messages = messages.messages;

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const fileName = `audios/message_${i}.mp3`;
    await voice.textToSpeech(elevenLabsApiKey, voiceID, fileName, message.text);
    await lipSyncMessage(i);
    message.audio = await audioFileToBase64(fileName);
    message.lipsync = await readJsonTranscript(`audios/message_${i}.json`);
  }

  res.send({ messages });
});

const readJsonTranscript = async (file) => {
  const data = await fs.readFile(file, "utf8");
  return JSON.parse(data);
};

const audioFileToBase64 = async (file) => {
  const data = await fs.readFile(file);
  return data.toString("base64");
};

app.listen(port, () => {
  console.log(`Virtual Assistant listening on port ${port}`);
});