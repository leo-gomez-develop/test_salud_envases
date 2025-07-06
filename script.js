// Global variables for app state
let userName = '';
let leaderboard = [];
let messageTimeoutRef = null;
let selectedActivity = '';
let selectedDuration = 0;
let hasSubmittedToday = false;
let currentUserNameTotalSteps = 0;
let currentUserNameTotalCalories = 0;
let uploadedImageBase64 = null; // To store the screenshot

// --- CONFIGURACIÓN IMPORTANTE ---
// Reemplaza esta URL con la URL de tu Google Apps Script Web App desplegada.
// Esta URL será tu "API" para interactuar con Google Sheets.
const GOOGLE_APPS_SCRIPT_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzIuQ8QTG1YIrnYjM29FprrHg_vmDqBAOzYaiXQRyq8FNVUVT2Uyb9q4Mpu4PZzxRYp/exec';

// Helper to format date as YYYY-MM-DD
const getTodayDateString = () => {
    const today = new Date();
    return today.toISOString().split('T')[0]; // YYYY-MM-DD
};

// Function to show a temporary message
const showMessage = (msg) => {
    const messageBox = document.getElementById('message-box');
    messageBox.textContent = msg;
    messageBox.classList.remove('hidden');
    messageBox.classList.add('animate-fade-in-down');

    if (messageTimeoutRef) {
        clearTimeout(messageTimeoutRef);
    }
    messageTimeoutRef = setTimeout(() => {
        messageBox.classList.remove('animate-fade-in-down');
        messageBox.classList.add('hidden');
    }, 3000); // Message disappears after 3 seconds
};

// Update UI elements based on current state
const updateUI = () => {
    document.getElementById('current-date').textContent = getTodayDateString();
    document.getElementById('user-greeting').textContent = userName ? `¡Hola, ${userName}!` : '';
    document.getElementById('total-steps').textContent = currentUserNameTotalSteps;
    document.getElementById('total-calories').textContent = currentUserNameTotalCalories;

    // The user select dropdown is enabled by default now, as it doesn't depend on Firebase auth
    // document.getElementById('user-select').disabled = !userId; // REMOVED: No longer depends on Firebase userId

    // Update submit button state
    const submitButton = document.getElementById('submit-button');
    const isFormComplete = userName && selectedActivity && selectedDuration !== 0 && document.getElementById('manual-steps').value !== '' && uploadedImageBase64;
    submitButton.disabled = hasSubmittedToday || !isFormComplete;
    submitButton.textContent = hasSubmittedToday ? 'Actividad Registrada Hoy' : 'Registrar Actividad Diaria';

    // Update duration buttons
    document.querySelectorAll('.btn-duration').forEach(btn => {
        const duration = parseInt(btn.dataset.duration);
        if (selectedDuration === duration) {
            btn.classList.add('selected');
        } else {
            btn.classList.remove('selected');
        }
    });

    // Update leaderboard
    const leaderboardList = document.getElementById('leaderboard-list');
    leaderboardList.innerHTML = ''; // Clear existing list

    if (leaderboard.length === 0) {
        leaderboardList.innerHTML = '<li class="text-gray-600 text-center">No hay participantes aún. ¡Sé el primero!</li>';
    } else {
        // Display only top 3
        const top3 = leaderboard.slice(0, 3);
        top3.forEach((user, index) => {
            const listItem = document.createElement('li');
            listItem.className = `leaderboard-item ${user.userName === userName ? 'current-user' : ''}`;
            listItem.innerHTML = `
                <div class="flex items-center">
                    <span class="text-xl font-bold text-gray-700 mr-3">${index + 1}.</span>
                    <span class="font-medium text-gray-800 truncate">${user.userName}</span>
                </div>
                <div class="text-right">
                    <p class="text-lg font-semibold text-red-700">${user.totalSteps} pasos</p>
                    <p class="text-sm text-gray-500">${user.totalCalories} calorías</p>
                </div>
            `;
            leaderboardList.appendChild(listItem);
        });
    }

    const currentUserPositionElement = document.getElementById('current-user-position');
    if (userName && currentUserPosition > 0) {
        currentUserPositionElement.textContent = `¡Tu posición actual es: ${currentUserPosition}!`;
    } else {
        currentUserPositionElement.textContent = '';
    }
};

// Calculate current user's position (global scope for updateUI)
let currentUserPosition = 0;

// Function to fetch participants from Google Sheet via GAS
const fetchParticipants = async () => {
    try {
        const response = await fetch(`${GOOGLE_APPS_SCRIPT_WEB_APP_URL}?action=getParticipants`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        
        // Sort alphabetically by name
        const sortedParticipants = data.sort((a, b) => a.name.localeCompare(b.name));

        const userSelect = document.getElementById('user-select');
        userSelect.innerHTML = '<option value="">-- Selecciona un participante --</option>'; // Clear and add default
        sortedParticipants.forEach(user => {
            const option = document.createElement('option');
            option.value = user.name;
            option.textContent = user.name;
            userSelect.appendChild(option);
        });
        userSelect.disabled = false; // Enable the dropdown after loading
        console.log("Participants loaded:", sortedParticipants);
    } catch (error) {
        console.error("Error fetching participants:", error);
        showMessage("Error al cargar la lista de participantes.");
        document.getElementById('user-select').disabled = true; // Keep disabled on error
    }
};

// Load data for the selected userName from Google Sheet via GAS
const loadUserNameData = async () => {
    if (!userName) {
        currentUserNameTotalSteps = 0;
        currentUserNameTotalCalories = 0;
        hasSubmittedToday = false;
        updateUI();
        return;
    }

    try {
        const response = await fetch(`${GOOGLE_APPS_SCRIPT_WEB_APP_URL}?action=getUserData&userName=${encodeURIComponent(userName)}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const userData = await response.json();

        currentUserNameTotalSteps = userData.totalSteps || 0;
        currentUserNameTotalCalories = userData.totalCalories || 0;

        const lastSubmissionDateForThisUserName = userData.lastSubmissionDate;
        if (lastSubmissionDateForThisUserName && lastSubmissionDateForThisUserName === getTodayDateString()) {
            hasSubmittedToday = true;
        } else {
            hasSubmittedToday = false;
        }
    } catch (error) {
        console.error("Error loading user name data:", error);
        showMessage("Error al cargar datos del usuario.");
    } finally {
        updateUI();
    }
};

// Fetch leaderboard updates from Google Sheet via GAS
const fetchLeaderboard = async () => {
    try {
        const response = await fetch(`${GOOGLE_APPS_SCRIPT_WEB_APP_URL}?action=getLeaderboard`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        
        // Data is already sorted by GAS, but re-sort just in case
        data.sort((a, b) => b.totalSteps - a.totalSteps);
        leaderboard = data;
        console.log("Leaderboard updated:", leaderboard);

        // Update current user's displayed steps/calories if their name is selected
        const currentUserEntry = leaderboard.find(user => user.userName === userName);
        if (currentUserEntry) {
            currentUserNameTotalSteps = currentUserEntry.totalSteps;
            currentUserNameTotalCalories = currentUserEntry.totalCalories;
        }

        currentUserPosition = leaderboard.findIndex(user => user.userName === userName) + 1;
    } catch (error) {
        console.error("Error fetching leaderboard:", error);
        showMessage("Error al cargar el tablero de clasificación.");
    } finally {
        updateUI();
    }
};

// Handle user name selection
const handleUserNameChange = async (event) => {
    const selectedName = event.target.value;
    userName = selectedName;
    await loadUserNameData(); // Load data for the newly selected user
    updateUI();
};

// Handle activity selection
const handleActivityChange = (event) => {
    selectedActivity = event.target.value;
    updateUI();
};

// Handle duration selection
const handleDurationChange = (duration) => {
    selectedDuration = duration;
    updateUI();
};

// Handle manual steps input
const handleManualStepsChange = (event) => {
    updateUI(); // To update button disabled state
};

// Handle image upload
const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
            uploadedImageBase64 = reader.result;
            document.getElementById('screenshot-preview').src = uploadedImageBase64;
            document.getElementById('screenshot-preview').classList.remove('hidden');
            updateUI();
        };
        reader.readAsDataURL(file);
    } else {
        uploadedImageBase64 = null;
        document.getElementById('screenshot-preview').classList.add('hidden');
        document.getElementById('screenshot-preview').src = '';
        updateUI();
    }
};

// Simulate daily activity (steps and calories) based on activity and duration
const calculateActivityData = (manualSteps) => {
    let stepsPerMinute = 70; // Default for walking
    let caloriesPerMinute = 5; // Default for walking

    switch (selectedActivity) {
        case 'Correr': stepsPerMinute = 150; caloriesPerMinute = 10; break;
        case 'Ciclismo': stepsPerMinute = 0; caloriesPerMinute = 8; break;
        case 'Nadar': stepsPerMinute = 0; caloriesPerMinute = 9; break;
        case 'Levantamiento de pesas': stepsPerMinute = 10; caloriesPerMinute = 6; break;
        case 'Fútbol': stepsPerMinute = 120; caloriesPerMinute = 11; break;
        case 'Baloncesto': stepsPerMinute = 110; caloriesPerMinute = 10; break;
        default: stepsPerMinute = 70; caloriesPerMinute = 5; break; // Caminar
    }

    const calculatedStepsFromActivity = stepsPerMinute * selectedDuration;
    const totalCalculatedSteps = calculatedStepsFromActivity + parseInt(manualSteps || 0);
    const totalCalculatedCalories = Math.round(totalCalculatedSteps * 0.04); // Simplified calculation

    return { totalCalculatedSteps, totalCalculatedCalories };
};

// Function to handle daily data submission
const handleDailySubmission = async () => {
    const manualSteps = document.getElementById('manual-steps').value;

    if (!userName || !selectedActivity || selectedDuration === 0 || manualSteps === '' || uploadedImageBase64 === null) {
        showMessage("Por favor, completa toda la información antes de registrar.");
        return;
    }
    if (hasSubmittedToday) {
        showMessage("¡Ya has registrado tu actividad diaria hoy para este usuario!");
        return;
    }

    const todayDate = getTodayDateString();
    const { totalCalculatedSteps, totalCalculatedCalories } = calculateActivityData(manualSteps);

    try {
        const response = await fetch(`${GOOGLE_APPS_SCRIPT_WEB_APP_URL}?action=submitActivity`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded', // Required for GAS doPost
            },
            body: JSON.stringify({ // Send as JSON string in body
                userName: userName,
                steps: totalCalculatedSteps,
                calories: totalCalculatedCalories,
                activity: selectedActivity,
                duration: selectedDuration,
                screenshot: uploadedImageBase64,
                todayDate: todayDate,
            }),
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const result = await response.json();

        if (result.success) {
            currentUserNameTotalSteps += totalCalculatedSteps;
            currentUserNameTotalCalories += totalCalculatedCalories;
            hasSubmittedToday = true;

            showMessage("¡Actividad diaria registrada exitosamente! ¡Sigue así, campeón!");
            document.getElementById('submit-button').classList.add('pulse-on-submit');
            setTimeout(() => {
                document.getElementById('submit-button').classList.remove('pulse-on-submit');
            }, 500);

            // Reset form fields after successful submission
            selectedActivity = '';
            selectedDuration = 0;
            document.getElementById('manual-steps').value = '';
            uploadedImageBase64 = null;
            document.getElementById('screenshot-input').value = ''; // Clear file input
            document.getElementById('screenshot-preview').classList.add('hidden');
            document.getElementById('screenshot-preview').src = '';

            // Re-fetch leaderboard to update totals for all
            fetchLeaderboard();

        } else {
            showMessage(`Error al registrar: ${result.message || 'Desconocido'}`);
        }

    } catch (error) {
        console.error("Error saving daily submission:", error);
        showMessage("Error al registrar la actividad diaria.");
    } finally {
        updateUI();
    }
};

// Data for activities (sorted here for convenience)
const commonActivities = [
    'Caminar', 'Correr', 'Ciclismo', 'Nadar', 'Levantamiento de pesas', 'Fútbol', 'Baloncesto'
].sort((a, b) => a.localeCompare(b)); // Sort alphabetically

// Initial setup on window load
window.onload = async () => {
    // Populate activity dropdown
    const activitySelect = document.getElementById('activity-select');
    commonActivities.forEach(activity => {
        const option = document.createElement('option');
        option.value = activity;
        option.textContent = activity;
        activitySelect.appendChild(option);
    });

    // Fetch participants and leaderboard on load
    await fetchParticipants();
    await fetchLeaderboard();

    updateUI(); // Initial UI render

    // Attach event listeners
    document.getElementById('user-select').addEventListener('change', handleUserNameChange);
    document.getElementById('activity-select').addEventListener('change', handleActivityChange);
    document.getElementById('submit-button').addEventListener('click', handleDailySubmission);
    document.getElementById('manual-steps').addEventListener('input', handleManualStepsChange);
    document.getElementById('screenshot-input').addEventListener('change', handleImageUpload);

    document.querySelectorAll('.btn-duration').forEach(btn => {
        btn.addEventListener('click', () => handleDurationChange(parseInt(btn.dataset.duration)));
    });

    // Set up periodic leaderboard refresh (e.g., every 30 seconds)
    setInterval(fetchLeaderboard, 30000);
};
