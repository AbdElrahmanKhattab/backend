const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const dbConfig = {
    host: '127.0.0.1',
    user: 'root',
    password: 'Mazen198165967#',
    database: 'PhysioCaseLab',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    multipleStatements: true
};

const categories = ['Knee', 'Back', 'Shoulder', 'Hip', 'Ankle'];

const casesData = {
    'Knee': [
        {
            title: 'Acute ACL Tear in Soccer Player',
            difficulty: 'Intermediate',
            brief: '24-year-old male soccer player felt a pop in his knee after a pivot.',
            duration: 15,
            steps: [
                {
                    type: 'info',
                    content: {
                        patientName: 'Ahmed K.',
                        age: 24,
                        gender: 'Male',
                        description: 'Patient presents with a swollen right knee. He was playing soccer yesterday and twisted his knee while changing direction. He heard a loud "pop" and could not continue playing.',
                        chiefComplaint: 'ركبتي ورمت ومش قادر ادوس عليها بعد الماتش',
                        imageUrl: null
                    }
                },
                {
                    type: 'history',
                    content: {
                        title: 'History of Present Illness',
                        description: 'Key questions to ask regarding the injury mechanism.',
                        questions: [
                            { icon: '⚽', question: 'How exactly did the injury happen?', answer: 'I was running and tried to cut to the left, but my foot got stuck and my knee twisted.' },
                            { icon: '🔊', question: 'Did you hear any sound?', answer: 'Yes, a loud pop.' },
                            { icon: '🎈', question: 'When did the swelling start?', answer: 'Almost immediately, within an hour it was very swollen.' },
                            { icon: '🚶', question: 'Can you bear weight?', answer: 'It feels unstable, like it might give way.' }
                        ]
                    }
                },
                {
                    type: 'investigation',
                    investigations: [
                        { groupLabel: 'Special Tests', testName: 'Lachman Test', description: 'Assess anterior translation of tibia', result: 'Positive (Soft end feel)', videoUrl: '' },
                        { groupLabel: 'Special Tests', testName: 'Anterior Drawer Test', description: 'Assess anterior instability', result: 'Positive', videoUrl: '' },
                        { groupLabel: 'Special Tests', testName: 'McMurray Test', description: 'Check for meniscus tear', result: 'Negative', videoUrl: '' }
                    ],
                    xrays: []
                },
                {
                    type: 'mcq',
                    question: 'Based on the history and special tests, what is the most likely diagnosis?',
                    explanationOnFail: 'The mechanism of pivoting with a "pop" and immediate swelling (hemarthrosis) combined with a positive Lachman test is classic for ACL injury.',
                    maxScore: 10,
                    options: [
                        { label: 'Medial Meniscus Tear', isCorrect: false, feedback: 'Meniscus tears usually have delayed swelling (6-24h) and locking symptoms.' },
                        { label: 'Anterior Cruciate Ligament (ACL) Tear', isCorrect: true, feedback: 'Correct! Immediate swelling, "pop" sound, and instability are hallmarks of ACL tears.' },
                        { label: 'Patellar Dislocation', isCorrect: false, feedback: 'Patellar dislocation would usually show visible deformity or apprehension.' },
                        { label: 'MCL Sprain', isCorrect: false, feedback: 'MCL sprains are usually from a valgus blow and have medial tenderness, not necessarily immediate massive swelling.' }
                    ]
                }
            ]
        },
        {
            title: 'Knee Osteoarthritis in Elderly',
            difficulty: 'Beginner',
            brief: '65-year-old female with gradual onset of knee pain and morning stiffness.',
            duration: 10,
            steps: [
                {
                    type: 'info',
                    content: {
                        patientName: 'Fatima S.',
                        age: 65,
                        gender: 'Female',
                        description: 'Patient complains of bilateral knee pain, worse on the right. Pain increases with activity and improves with rest. She reports stiffness in the morning that lasts about 20 minutes.',
                        chiefComplaint: 'ركبي بتوجعني اوي لما بصحى من النوم ومش بقدر امشي كتير',
                        imageUrl: null
                    }
                },
                {
                    type: 'history',
                    content: {
                        title: 'Subjective Assessment',
                        description: 'Explore the nature of pain and functional limitations.',
                        questions: [
                            { icon: '🌅', question: 'How long does the morning stiffness last?', answer: 'About 15-20 minutes, then it loosens up.' },
                            { icon: '🪜', question: 'Do stairs bother you?', answer: 'Yes, going down is very painful.' },
                            { icon: '🔊', question: 'Do you feel any grinding sound?', answer: 'Yes, I hear a crunching noise when I move my knees.' }
                        ]
                    }
                },
                {
                    type: 'mcq',
                    question: 'Which of the following findings would you most expect on physical examination?',
                    explanationOnFail: 'Osteoarthritis is characterized by crepitus, bony enlargement, and reduced range of motion.',
                    maxScore: 10,
                    options: [
                        { label: 'Significant warmth and redness', isCorrect: false, feedback: 'This would suggest infection or acute inflammation (e.g., gout).' },
                        { label: 'Crepitus and bony enlargement', isCorrect: true, feedback: 'Correct. Crepitus and osteophytes (bony spurs) are common in OA.' },
                        { label: 'Positive Lachman test', isCorrect: false, feedback: 'This tests for ACL stability, not typical for OA unless there is prior trauma.' }
                    ]
                },
                {
                    type: 'investigation',
                    investigations: [],
                    xrays: [
                        { label: 'X-Ray AP View', icon: '🦴', imageUrl: 'https://prod-images-static.radiopaedia.org/images/51560662/3b889d068565780564639903903114_jumbo.jpeg' }
                    ]
                }
            ]
        },
        {
            title: 'Patellar Tendinopathy (Jumper\'s Knee)',
            difficulty: 'Intermediate',
            brief: '28-year-old basketball player with anterior knee pain.',
            duration: 12,
            steps: [
                {
                    type: 'info',
                    content: {
                        patientName: 'Omar D.',
                        age: 28,
                        gender: 'Male',
                        description: 'Professional basketball player reports localized pain at the bottom of his kneecap. Pain is worst after training and sitting for long periods.',
                        chiefComplaint: 'عندي وجع تحت الصابونة بيزيد بعد التمرين',
                        imageUrl: null
                    }
                },
                {
                    type: 'investigation',
                    investigations: [
                        { groupLabel: 'Palpation', testName: 'Inferior Patellar Pole Tenderness', description: 'Palpate the inferior pole of the patella', result: 'Sharp pain reproduced', videoUrl: '' },
                        { groupLabel: 'Functional Test', testName: 'Single Leg Decline Squat', description: 'Squat on a decline board', result: 'Pain reproduced at 30 degrees flexion', videoUrl: '' }
                    ],
                    xrays: []
                },
                {
                    type: 'mcq',
                    question: 'What is the gold standard exercise intervention for this condition?',
                    explanationOnFail: 'Eccentric loading or heavy slow resistance training is the evidence-based treatment for tendinopathy.',
                    maxScore: 10,
                    options: [
                        { label: 'Complete rest for 6 weeks', isCorrect: false, feedback: 'Complete rest often leads to deconditioning and does not strengthen the tendon.' },
                        { label: 'Cortisone injection', isCorrect: false, feedback: 'Injections carry a risk of tendon rupture and are not first-line.' },
                        { label: 'Eccentric or Heavy Slow Resistance training', isCorrect: true, feedback: 'Correct. Loading the tendon is crucial for remodeling.' }
                    ]
                }
            ]
        }
    ],
    'Back': [
        {
            title: 'Acute Lumbar Disc Herniation',
            difficulty: 'Advanced',
            brief: '35-year-old male with back pain radiating down the left leg.',
            duration: 20,
            steps: [
                {
                    type: 'info',
                    content: {
                        patientName: 'Hassan M.',
                        age: 35,
                        gender: 'Male',
                        description: 'Developed severe lower back pain after lifting a heavy box. The pain shoots down the back of his left leg to the foot. Coughing makes it worse.',
                        chiefComplaint: 'ضهري "طق" وانا بشيل صندوق، ودلوقتي في كهرباء ماشية في رجلي الشمال',
                        imageUrl: null
                    }
                },
                {
                    type: 'investigation',
                    investigations: [
                        { groupLabel: 'Neurodynamics', testName: 'Straight Leg Raise (SLR)', description: 'Passive leg raise', result: 'Positive at 40 degrees on Left', videoUrl: '' },
                        { groupLabel: 'Neurological', testName: 'Dermatome S1', description: 'Sensation testing lateral foot', result: 'Diminished sensation', videoUrl: '' },
                        { groupLabel: 'Neurological', testName: 'Reflexes', description: 'Ankle Jerk (S1)', result: 'Absent on Left', videoUrl: '' }
                    ],
                    xrays: []
                },
                {
                    type: 'mcq',
                    question: 'Which nerve root is most likely affected given the S1 signs (lateral foot numbness, absent ankle jerk)?',
                    explanationOnFail: 'S1 nerve root compression typically affects the lateral foot, calf, and ankle reflex.',
                    maxScore: 10,
                    options: [
                        { label: 'L4', isCorrect: false, feedback: 'L4 affects the medial calf and knee jerk.' },
                        { label: 'L5', isCorrect: false, feedback: 'L5 affects the big toe extension and dorsum of the foot.' },
                        { label: 'S1', isCorrect: true, feedback: 'Correct. S1 radiculopathy affects the lateral foot and ankle reflex.' }
                    ]
                }
            ]
        },
        {
            title: 'Mechanical Low Back Pain',
            difficulty: 'Beginner',
            brief: '40-year-old office worker with dull ache in lower back.',
            duration: 10,
            steps: [
                {
                    type: 'info',
                    content: {
                        patientName: 'Mona L.',
                        age: 40,
                        gender: 'Female',
                        description: 'Reports dull, aching pain across the lower back. No radiation to legs. Worse after sitting at her desk all day. Improves with walking.',
                        chiefComplaint: 'ضهري بيوجعني من قعدة المكتب طول اليوم',
                        imageUrl: null
                    }
                },
                {
                    type: 'history',
                    content: {
                        title: 'Red Flags Screening',
                        description: 'Rule out serious pathology.',
                        questions: [
                            { icon: '🚽', question: 'Any bladder or bowel changes?', answer: 'No.' },
                            { icon: '🌙', question: 'Does pain wake you at night?', answer: 'No, I sleep fine.' },
                            { icon: '⚡', question: 'Any numbness in the saddle area?', answer: 'No.' }
                        ]
                    }
                },
                {
                    type: 'mcq',
                    question: 'Since there are no red flags and no radiculopathy, what is the best initial management?',
                    explanationOnFail: 'Mechanical back pain responds well to movement and posture correction.',
                    maxScore: 10,
                    options: [
                        { label: 'Bed rest for 1 week', isCorrect: false, feedback: 'Bed rest is contraindicated for mechanical back pain.' },
                        { label: 'MRI of lumbar spine', isCorrect: false, feedback: 'Imaging is not indicated for non-specific back pain without red flags.' },
                        { label: 'Advice to remain active and ergonomic education', isCorrect: true, feedback: 'Correct. Movement and posture advice are key.' }
                    ]
                }
            ]
        },
        {
            title: 'Lumbar Spinal Stenosis',
            difficulty: 'Intermediate',
            brief: '72-year-old male with leg pain when walking.',
            duration: 15,
            steps: [
                {
                    type: 'info',
                    content: {
                        patientName: 'Ibrahim G.',
                        age: 72,
                        gender: 'Male',
                        description: 'Reports pain and heaviness in both legs when walking for more than 5 minutes. The pain goes away if he sits down or leans forward on a shopping cart.',
                        chiefComplaint: 'رجلي بتتقل وبنمل لما بمشي، ولازم اقعد عشان ارتاح',
                        imageUrl: null
                    }
                },
                {
                    type: 'mcq',
                    question: 'This presentation (Neurogenic Claudication) is relieved by flexion because:',
                    explanationOnFail: 'Flexion increases the diameter of the spinal canal and intervertebral foramina, relieving pressure.',
                    maxScore: 10,
                    options: [
                        { label: 'It stretches the hamstrings', isCorrect: false, feedback: 'Incorrect.' },
                        { label: 'It opens the spinal canal and foramina', isCorrect: true, feedback: 'Correct. Extension narrows the canal, flexion opens it.' },
                        { label: 'It increases blood flow to the legs', isCorrect: false, feedback: 'That would be vascular claudication, which is not relieved by position change alone (only rest).' }
                    ]
                }
            ]
        }
    ],
    'Shoulder': [
        {
            title: 'Subacromial Impingement Syndrome',
            difficulty: 'Intermediate',
            brief: '45-year-old painter with shoulder pain on overhead activities.',
            duration: 15,
            steps: [
                {
                    type: 'info',
                    content: {
                        patientName: 'Sami R.',
                        age: 45,
                        gender: 'Male',
                        description: 'Painter by profession. Pain in the right shoulder when reaching up to paint ceilings. Pain is located on the lateral aspect of the arm.',
                        chiefComplaint: 'كتفي بيوجعني لما برفع ايدي فوق عشان ادهن السقف',
                        imageUrl: null
                    }
                },
                {
                    type: 'investigation',
                    investigations: [
                        { groupLabel: 'Special Tests', testName: 'Neer\'s Test', description: 'Passive flexion with internal rotation', result: 'Positive', videoUrl: '' },
                        { groupLabel: 'Special Tests', testName: 'Hawkins-Kennedy Test', description: 'Passive internal rotation at 90 deg flexion', result: 'Positive', videoUrl: '' },
                        { groupLabel: 'Special Tests', testName: 'Painful Arc', description: 'Active abduction', result: 'Pain between 60-120 degrees', videoUrl: '' }
                    ],
                    xrays: []
                },
                {
                    type: 'mcq',
                    question: 'Which rotator cuff tendon is most commonly impinged in this scenario?',
                    explanationOnFail: 'The supraspinatus tendon passes directly under the subacromial arch.',
                    maxScore: 10,
                    options: [
                        { label: 'Subscapularis', isCorrect: false, feedback: 'Subscapularis is anterior.' },
                        { label: 'Supraspinatus', isCorrect: true, feedback: 'Correct. It is the most commonly involved tendon.' },
                        { label: 'Teres Minor', isCorrect: false, feedback: 'Teres minor is posterior.' }
                    ]
                }
            ]
        },
        {
            title: 'Frozen Shoulder (Adhesive Capsulitis)',
            difficulty: 'Intermediate',
            brief: '50-year-old diabetic female with severe shoulder stiffness.',
            duration: 15,
            steps: [
                {
                    type: 'info',
                    content: {
                        patientName: 'Hoda B.',
                        age: 50,
                        gender: 'Female',
                        description: 'History of diabetes. Gradual onset of shoulder pain followed by significant stiffness. Cannot reach behind her back to fasten bra.',
                        chiefComplaint: 'كتفي متخشب ومش عارفة احرك ايدي ورا ضهري',
                        imageUrl: null
                    }
                },
                {
                    type: 'investigation',
                    investigations: [
                        { groupLabel: 'ROM', testName: 'Active/Passive External Rotation', description: 'Range of motion check', result: 'Severely limited (0 degrees)', videoUrl: '' },
                        { groupLabel: 'ROM', testName: 'Abduction', description: 'Range of motion check', result: 'Limited to 80 degrees with scapular hiking', videoUrl: '' }
                    ],
                    xrays: []
                },
                {
                    type: 'mcq',
                    question: 'What is the capsular pattern of restriction for the shoulder?',
                    explanationOnFail: 'The capsular pattern is External Rotation > Abduction > Internal Rotation.',
                    maxScore: 10,
                    options: [
                        { label: 'Flexion > Extension > Rotation', isCorrect: false, feedback: 'Incorrect.' },
                        { label: 'External Rotation > Abduction > Internal Rotation', isCorrect: true, feedback: 'Correct. ER is the most limited movement.' },
                        { label: 'Internal Rotation > Flexion > Abduction', isCorrect: false, feedback: 'Incorrect.' }
                    ]
                }
            ]
        },
        {
            title: 'Anterior Shoulder Dislocation',
            difficulty: 'Beginner',
            brief: '20-year-old male fell on outstretched arm.',
            duration: 12,
            steps: [
                {
                    type: 'info',
                    content: {
                        patientName: 'Karim T.',
                        age: 20,
                        gender: 'Male',
                        description: 'Fell during a rugby match on an outstretched arm. Shoulder looks "squared off". Severe pain.',
                        chiefComplaint: 'وقعت على ايدي وكتفي شكله غريب وواجعني جدا',
                        imageUrl: null
                    }
                },
                {
                    type: 'investigation',
                    investigations: [],
                    xrays: [
                        { label: 'AP Shoulder X-Ray', icon: '🦴', imageUrl: 'https://prod-images-static.radiopaedia.org/images/32228/330cc7065992647035175657375252_jumbo.jpg' }
                    ]
                },
                {
                    type: 'mcq',
                    question: 'After reduction and immobilization, which movement should be avoided in the early phase to prevent recurrence?',
                    explanationOnFail: 'Abduction and External Rotation is the position of dislocation.',
                    maxScore: 10,
                    options: [
                        { label: 'Internal Rotation', isCorrect: false, feedback: 'Internal rotation is generally safe.' },
                        { label: 'Combined Abduction and External Rotation', isCorrect: true, feedback: 'Correct. This position stresses the anterior capsule.' },
                        { label: 'Adduction', isCorrect: false, feedback: 'Adduction is safe.' }
                    ]
                }
            ]
        }
    ],
    'Hip': [
        {
            title: 'Hip Osteoarthritis',
            difficulty: 'Beginner',
            brief: '70-year-old male with groin pain and stiffness.',
            duration: 12,
            steps: [
                {
                    type: 'info',
                    content: {
                        patientName: 'Mahmoud A.',
                        age: 70,
                        gender: 'Male',
                        description: 'Deep groin pain on the right side. Difficulty putting on socks and shoes. Stiffness after sitting.',
                        chiefComplaint: 'عندي وجع في فخدتي من جوه ومش عارف البس الشراب',
                        imageUrl: null
                    }
                },
                {
                    type: 'investigation',
                    investigations: [
                        { groupLabel: 'ROM', testName: 'Hip Internal Rotation', description: 'Passive range', result: 'Limited and painful', videoUrl: '' },
                        { groupLabel: 'Special Tests', testName: 'FABER Test', description: 'Flexion Abduction External Rotation', result: 'Positive for groin pain', videoUrl: '' }
                    ],
                    xrays: []
                },
                {
                    type: 'mcq',
                    question: 'Where is true hip joint pain typically felt?',
                    explanationOnFail: 'True hip joint pathology usually refers pain to the groin (inguinal area) or anterior thigh.',
                    maxScore: 10,
                    options: [
                        { label: 'Buttock area', isCorrect: false, feedback: 'Buttock pain is often lumbar or SIJ origin.' },
                        { label: 'Lateral hip (Trochanter)', isCorrect: false, feedback: 'Lateral pain is usually bursitis or gluteal tendinopathy.' },
                        { label: 'Groin (Inguinal area)', isCorrect: true, feedback: 'Correct. This is the hallmark of intra-articular hip pathology.' }
                    ]
                }
            ]
        },
        {
            title: 'Greater Trochanteric Pain Syndrome',
            difficulty: 'Beginner',
            brief: '55-year-old female with lateral hip pain.',
            duration: 10,
            steps: [
                {
                    type: 'info',
                    content: {
                        patientName: 'Nadia F.',
                        age: 55,
                        gender: 'Female',
                        description: 'Pain on the outside of the hip. Cannot sleep on that side at night. Pain when walking up stairs.',
                        chiefComplaint: 'مش عارفة انام على جنبي اليمين من الوجع',
                        imageUrl: null
                    }
                },
                {
                    type: 'investigation',
                    investigations: [
                        { groupLabel: 'Palpation', testName: 'Greater Trochanter', description: 'Direct pressure', result: 'Exquisitely tender', videoUrl: '' }
                    ],
                    xrays: []
                },
                {
                    type: 'mcq',
                    question: 'This condition was formerly called Trochanteric Bursitis. What is the primary pathology usually?',
                    explanationOnFail: 'It is now understood to be primarily a tendinopathy of the Gluteus Medius/Minimus.',
                    maxScore: 10,
                    options: [
                        { label: 'Inflammation of the bursa only', isCorrect: false, feedback: 'Bursitis may be present but is secondary.' },
                        { label: 'Gluteal Tendinopathy', isCorrect: true, feedback: 'Correct. Degeneration of the gluteal tendons is the main issue.' },
                        { label: 'Hip Labral Tear', isCorrect: false, feedback: 'Labral tears cause groin pain/clicking.' }
                    ]
                }
            ]
        },
        {
            title: 'Femoroacetabular Impingement (FAI)',
            difficulty: 'Advanced',
            brief: '22-year-old hockey player with groin pain.',
            duration: 15,
            steps: [
                {
                    type: 'info',
                    content: {
                        patientName: 'Youssef H.',
                        age: 22,
                        gender: 'Male',
                        description: 'Intermittent sharp groin pain during sports, especially with twisting. Feels a "block" when bringing knee to chest.',
                        chiefComplaint: 'بحس بنغزة في الفخذ لما بجري او الف جسمي',
                        imageUrl: null
                    }
                },
                {
                    type: 'investigation',
                    investigations: [
                        { groupLabel: 'Special Tests', testName: 'FADIR Test', description: 'Flexion Adduction Internal Rotation', result: 'Positive (Reproduces pain)', videoUrl: '' }
                    ],
                    xrays: []
                },
                {
                    type: 'mcq',
                    question: 'The FADIR test assesses for impingement. A "Cam" lesion refers to:',
                    explanationOnFail: 'Cam lesion is a bony bump on the femoral neck. Pincer is over-coverage by the acetabulum.',
                    maxScore: 10,
                    options: [
                        { label: 'Over-coverage of the acetabulum', isCorrect: false, feedback: 'This is a Pincer lesion.' },
                        { label: 'Bony bump on the femoral neck', isCorrect: true, feedback: 'Correct. This causes abutment against the labrum.' },
                        { label: 'Labral detachment', isCorrect: false, feedback: 'This is a result of impingement, not the lesion itself.' }
                    ]
                }
            ]
        }
    ],
    'Ankle': [
        {
            title: 'Lateral Ankle Sprain',
            difficulty: 'Beginner',
            brief: '18-year-old female twisted ankle while walking.',
            duration: 10,
            steps: [
                {
                    type: 'info',
                    content: {
                        patientName: 'Sara M.',
                        age: 18,
                        gender: 'Female',
                        description: 'Stepped in a pothole and rolled her ankle inwards. Swelling on the outside of the ankle.',
                        chiefComplaint: 'رجلي لفت تحتي وورمت من بره',
                        imageUrl: null
                    }
                },
                {
                    type: 'investigation',
                    investigations: [
                        { groupLabel: 'Palpation', testName: 'ATFL Tenderness', description: 'Anterior Talo-Fibular Ligament', result: 'Tender', videoUrl: '' },
                        { groupLabel: 'Special Tests', testName: 'Anterior Drawer (Ankle)', description: 'Assess stability', result: 'Mild laxity compared to other side', videoUrl: '' }
                    ],
                    xrays: []
                },
                {
                    type: 'mcq',
                    question: 'Which ligament is most commonly injured in an inversion sprain?',
                    explanationOnFail: 'The ATFL is the weakest and most commonly injured lateral ligament.',
                    maxScore: 10,
                    options: [
                        { label: 'Deltoid Ligament', isCorrect: false, feedback: 'Deltoid is medial.' },
                        { label: 'Anterior Talo-Fibular Ligament (ATFL)', isCorrect: true, feedback: 'Correct. It is the first to tear in inversion.' },
                        { label: 'Posterior Talo-Fibular Ligament (PTFL)', isCorrect: false, feedback: 'PTFL is rarely injured alone.' }
                    ]
                }
            ]
        },
        {
            title: 'Achilles Tendinopathy',
            difficulty: 'Intermediate',
            brief: '35-year-old runner with heel pain.',
            duration: 12,
            steps: [
                {
                    type: 'info',
                    content: {
                        patientName: 'Tarek S.',
                        age: 35,
                        gender: 'Male',
                        description: 'Runner. Pain at the back of the heel. Stiffness in the morning. Pain warms up with running but returns after.',
                        chiefComplaint: 'كعبي بيوجعني من ورا، خصوصا اول ما اصحى',
                        imageUrl: null
                    }
                },
                {
                    type: 'investigation',
                    investigations: [
                        { groupLabel: 'Palpation', testName: 'Achilles Tendon', description: 'Palpate 2-6cm above insertion', result: 'Tender and thickened', videoUrl: '' }
                    ],
                    xrays: []
                },
                {
                    type: 'mcq',
                    question: 'What is a key sign of Achilles tendinopathy?',
                    explanationOnFail: 'Morning stiffness and the "warm-up" phenomenon are classic.',
                    maxScore: 10,
                    options: [
                        { label: 'Numbness in the toes', isCorrect: false, feedback: 'Suggests nerve entrapment.' },
                        { label: 'Pain that improves with rest and worsens immediately with activity', isCorrect: false, feedback: 'Tendinopathy often warms up (feels better) during activity initially.' },
                        { label: 'Morning stiffness and thickening of the tendon', isCorrect: true, feedback: 'Correct.' }
                    ]
                }
            ]
        },
        {
            title: 'Plantar Fasciitis',
            difficulty: 'Beginner',
            brief: '45-year-old teacher with heel pain on first steps.',
            duration: 10,
            steps: [
                {
                    type: 'info',
                    content: {
                        patientName: 'Amal K.',
                        age: 45,
                        gender: 'Female',
                        description: 'Sharp pain in the bottom of the heel. Worst when taking the first few steps in the morning or after sitting for a while.',
                        chiefComplaint: 'اول ما بنزل من السرير كعبي بيموتني، زي ما يكون فيه مسمار',
                        imageUrl: null
                    }
                },
                {
                    type: 'mcq',
                    question: 'The classic hallmark of plantar fasciitis is:',
                    explanationOnFail: 'Start-up pain (post-static dyskinesia) is the most specific symptom.',
                    maxScore: 10,
                    options: [
                        { label: 'Pain at night', isCorrect: false, feedback: 'Night pain is not typical.' },
                        { label: 'Pain on first steps in the morning', isCorrect: true, feedback: 'Correct. This is known as "start-up pain".' },
                        { label: 'Numbness in the heel', isCorrect: false, feedback: 'Suggests nerve compression (e.g., Tarsal Tunnel).' }
                    ]
                }
            ]
        }
    ]
};

async function seed() {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log('Connected to database.');

        for (const category of categories) {
            console.log(`Seeding category: ${category}`);
            const cases = casesData[category];

            if (!cases) {
                console.log(`No data for category ${category}, skipping.`);
                continue;
            }

            for (const caseData of cases) {
                // Insert Case
                const [res] = await connection.execute(
                    `INSERT INTO cases (title, specialty, category, difficulty, isLocked, metadata, duration)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        caseData.title,
                        'Physical Therapy',
                        category,
                        caseData.difficulty,
                        0,
                        JSON.stringify({ brief: caseData.brief }),
                        caseData.duration
                    ]
                );
                const caseId = res.insertId;
                console.log(`  Created case: ${caseData.title} (ID: ${caseId})`);

                // Insert Steps
                for (let i = 0; i < caseData.steps.length; i++) {
                    const step = caseData.steps[i];
                    const [stepRes] = await connection.execute(
                        `INSERT INTO case_steps (caseId, stepIndex, type, content, question, explanationOnFail, maxScore)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [
                            caseId,
                            i,
                            step.type,
                            step.content ? JSON.stringify(step.content) : null,
                            step.question || null,
                            step.explanationOnFail || null,
                            step.maxScore || 0
                        ]
                    );
                    const stepId = stepRes.insertId;

                    // Insert Options (if mcq)
                    if (step.type === 'mcq' && step.options) {
                        for (const opt of step.options) {
                            await connection.execute(
                                `INSERT INTO case_step_options (stepId, label, isCorrect, feedback)
                 VALUES (?, ?, ?, ?)`,
                                [stepId, opt.label, opt.isCorrect ? 1 : 0, opt.feedback]
                            );
                        }
                    }

                    // Insert Investigations (if investigation)
                    if (step.type === 'investigation' && step.investigations) {
                        for (const inv of step.investigations) {
                            await connection.execute(
                                `INSERT INTO investigations (stepId, groupLabel, testName, description, result, videoUrl)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                                [stepId, inv.groupLabel, inv.testName, inv.description, inv.result, inv.videoUrl]
                            );
                        }
                    }

                    // Insert X-Rays (if investigation or any step has xrays)
                    if (step.xrays) {
                        for (const xray of step.xrays) {
                            await connection.execute(
                                `INSERT INTO xrays (stepId, label, icon, imageUrl)
                 VALUES (?, ?, ?, ?)`,
                                [stepId, xray.label, xray.icon || '🦴', xray.imageUrl]
                            );
                        }
                    }
                }
            }
        }

        console.log('Seeding complete!');
    } catch (err) {
        console.error('Seeding failed:', err);
    } finally {
        if (connection) await connection.end();
    }
}

seed();
