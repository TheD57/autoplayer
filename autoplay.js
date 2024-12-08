// Configuration avec Object.freeze pour prevenir des modifications accidentelles (like real const)
const config = Object.freeze({
    selectors: Object.freeze({
        nextEpisodeButton: '.btn[title="épisode suivant"]',
        videoContainer: '.rmp-container',
        videoPlayer: '.rmp-video',
        fullscreen: '.rmp-fullscreen',
        playPause: '.rmp-play-pause'
    }),
    timing: Object.freeze({
        checkInterval: 1000,
        timeBeforeEndThreshold: 520
    }),
    storage: Object.freeze({
        key: 'autoPlayState'
    }),
    debugMode: false
});

class AutoPlayManager {
    #videoElement;
    #nextButton;
    #checkIntervalId;
    #wasFullscreen;
    #debug;
    #fullscreenRequested;
    #videoContainer;
    #fullscreenPromptShown;
    #isTransitioningToFullscreen;
    #toast;
    #fullscreenButton;
    #playButton;

    constructor() {
        this.#debug = config.debugMode;
        this.#wasFullscreen = this.#loadState().wasFullscreen || false;
        this.#fullscreenRequested = false;
        this.#fullscreenPromptShown = false;
        this.#isTransitioningToFullscreen = false;

        this.#log('Constructor initialized', {
            wasFullscreen: this.#wasFullscreen,
            debugMode: this.#debug
        });
    }

    #saveState(state) {
        this.#log('Saving state', state);
        try {
            localStorage.setItem(config.storage.key, JSON.stringify(state));
        } catch (error) {
            this.#log('Error saving state', { error: error.message });
        }
    }

    #loadState() {
        try {
            return JSON.parse(localStorage.getItem(config.storage.key)) || {};
        } catch (error) {
            this.#log('Error loading state', { error: error.message });
            return {};
        }
    }

    #log(message, data = {}) {
        if (!this.#debug) return;

        const timestamp = new Date().toISOString();
        console.log(`[AutoPlay ${timestamp}]`, message, data);
    }

    // Utilisation de WeakMap pour stocker les event listeners
    #eventListeners = new WeakMap();

    #createToastElement() {
        const toastTemplate = `
        <div class="next-episode-toast" style="display: none; position: absolute; bottom: 64px; right: 20px; 
            background: rgba(0, 0, 0, 0.9); color: white; padding: 20px; border-radius: 8px; z-index: 9999;
            font-family: Arial, sans-serif;">
            <button class="close-toast" style="position: absolute; top: 5px; right: 5px; background: transparent; 
                border: none; color: white; cursor: pointer; padding: 5px; font-size: 18px;">×</button>
            <h3 style="margin: 0 0 10px 0; font-size: 16px;">Prochain épisode</h3>
            <div class="toast-buttons" style="display: flex; gap: 10px;">
                <button class="skip-credits" style="padding: 8px 16px; background: white; color: black; 
                    border: none; border-radius: 4px; cursor: pointer; font-size: 14px;">
                    Passer le générique (<span class="countdown">30</span>s)
                </button>
                <button class="next-episode" style="padding: 8px 16px; background: #333; color: white; 
                    border: none; border-radius: 4px; cursor: pointer; font-size: 14px;">
                    Épisode suivant
                </button>
            </div>
        </div>`;

        const template = document.createElement('template');
        template.innerHTML = toastTemplate.trim();
        this.#toast = template.content.firstElementChild;

        this.#toast.addEventListener('click', (e) => {
            if (e.target.matches('.close-toast')) {
                this.#log('Close button clicked');
                this.stop();
                return;
            }

            if (e.target.closest('.next-episode')) {
                this.#log(`${e.target.className} button clicked`);
                this.#goToNextEpisode();
            }

            if (e.target.closest('.skip-credits')) {
                this.#log('Skip credits button clicked');
                this.#skipToEnd();
            }
        });

        this.#videoContainer.appendChild(this.#toast);
        this.#log('Toast element created and added to container');
    }
    #findElements() {
        const selectors = config.selectors;
        this.#videoElement = document.querySelector(selectors.videoPlayer);
        this.#nextButton = document.querySelector(selectors.nextEpisodeButton);
        this.#fullscreenButton = document.querySelector(selectors.fullscreen);
        this.#playButton = document.querySelector(selectors.playPause);
        this.#videoContainer = document.querySelector(selectors.videoContainer);

        return Boolean(this.#videoElement && this.#videoContainer);
    }

    #setupEventListeners() {
        // Utilisation de requestAnimationFrame pour des vérifications plus fluides
        let lastCheck = 0;
        const checkProgress = (timestamp) => {
            if (timestamp - lastCheck >= config.timing.checkInterval) {
                this.#checkVideoProgress();
                lastCheck = timestamp;
            }
            this.#checkIntervalId = requestAnimationFrame(checkProgress);
        };
        this.#checkIntervalId = requestAnimationFrame(checkProgress);

        // Meilleure gestion des événements
        const controller = new AbortController();
        const signal = controller.signal;

        document.addEventListener('fullscreenchange', () => {
            const isFullscreen = Boolean(document.fullscreenElement);
            this.#handleFullscreenChange(isFullscreen);
        }, { signal });

        if (this.#videoElement) {
            // Gestion de la fin de la vidéo
            this.#videoElement.addEventListener('ended', () => {
                this.#log('Video ended event triggered');
                if (!this.#nextButton) {
                    this.#log('No next episode available, stopping manager');
                    this.#createEndSeriesUI();
                    this.stop();
                    return;
                }
                this.#goToNextEpisode();
            }, { signal });

            // Gestion des erreurs de lecture
            this.#videoElement.addEventListener('error', (e) => {
                this.#log('Video error triggered', { error: e });
                this.#log('Video error occurred', {
                    error: this.#videoElement.error,
                    errorCode: this.#videoElement.error?.code,
                    errorMessage: this.#videoElement.error?.message
                });
                this.#log('Stopping manager');
                this.stop();
            }, { signal });

            // Gestion des échecs de chargement
            this.#videoElement.addEventListener('stalled', () => {
                this.#log('Video playback stalled');
                // On attend un peu avant de stopper pour laisser une chance de récupération
                setTimeout(() => {
                    if (this.#videoElement?.error) {
                        this.#log('Video recovery failed, stopping manager');
                        this.stop();
                    }
                }, 5000);
            }, { signal });
        }

        // Stockage du controller pour le nettoyage
        this.#eventListeners.set(this, controller);
    }

    #handleFullscreenChange(isFullscreen) {
        this.#log('Fullscreen state changed', {
            isFullscreen,
            wasFullscreen: this.#wasFullscreen,
            isTransitioning: this.#isTransitioningToFullscreen
        });

        this.#wasFullscreen = isFullscreen;
        this.#saveState({ wasFullscreen: isFullscreen });

        if (isFullscreen && this.#videoElement?.paused && this.#isTransitioningToFullscreen) {
            this.#log('Auto-playing video after fullscreen transition');
            this.#videoElement.play().catch(error => this.#log('Error auto-playing video', { error }));
            this.#isTransitioningToFullscreen = false;
        }

        this.#fullscreenRequested = false;
    }

    #checkVideoProgress() {
        if (!this.#videoElement?.duration || !this.#nextButton) return;

        const timeRemaining = this.#videoElement.duration - this.#videoElement.currentTime;
        const skipCreditsButton = this.#toast?.querySelector('.skip-credits');

        if (timeRemaining <= config.timing.timeBeforeEndThreshold) {
            this.#showToast();
            this.#updateCountdown(Math.floor(timeRemaining));

            if (skipCreditsButton) {
                if (timeRemaining <= 15) {
                    skipCreditsButton.style.display = 'none';
                } else {
                    skipCreditsButton.style.display = 'inline-block';
                }
            }

        } else {
            this.#hideToast();
        }

        if (timeRemaining <= 0 && !this.#videoElement.paused) {
            this.#goToNextEpisode();
        }
    }

    init() {
        this.#log('Initializing AutoPlayManager');

        if (!this.#findElements()) {
            this.#log('Initialization failed - required elements not found');
            return false;
        }

        this.#createToastElement();
        this.#setupEventListeners();

        const state = this.#loadState();
        if (state.shouldAutoPlay) {
            this.#autoPlayIfNeeded();
        }

        return true;
    }

    #autoPlayIfNeeded() {
        this.#log('Auto-resuming after page change');

        if (this.#playButton) {
            this.#playButton.click();

            if (this.#wasFullscreen && !this.#fullscreenPromptShown) {
               this.#showFullscreenPrompt();
            }
        }

        this.#saveState({ shouldAutoPlay: false });
    }

    #showFullscreenPrompt() {
        this.#log('Creating fullscreen prompt');
        const prompt = document.createElement('div');
        prompt.id = 'fullscreen-prompt';
        prompt.innerHTML = `
            <style>
                #fullscreen-prompt {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background-color: rgba(0, 0, 0, 0.5);
                    z-index: 9999;
                }

                .prompt-container {
                    background-color: #18181b;
                    border-radius: 0.5rem;
                    padding: 1.5rem;
                    max-width: 24rem;
                    margin: 0 1rem;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                    border: 1px solid #27272a;
                }

                .prompt-content {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 1rem;
                }

                .icon-container {
                    width: 3rem;
                    height: 3rem;
                    color: white;
                }

                .prompt-text {
                    text-align: center;
                }

                .prompt-title {
                    color: white;
                    font-size: 1.25rem;
                    font-weight: 600;
                    margin-bottom: 0.5rem;
                }

                .prompt-subtitle {
                    color: #d4d4d8;
                    font-size: 0.875rem;
                }

                .button-container {
                    display: flex;
                    gap: 0.75rem;
                    width: 100%;
                    margin-top: 0.5rem;
                }

                .button {
                    flex: 1;
                    padding: 0.5rem 1rem;
                    border-radius: 0.375rem;
                    border: none;
                    color: white;
                    cursor: pointer;
                    transition: background-color 0.2s;
                    font-size: 0.875rem;
                }

                .accept-button {
                    background-color: #2563eb;
                }

                .accept-button:hover {
                    background-color: #1d4ed8;
                }

                .decline-button {
                    background-color: #3f3f46;
                }

                .decline-button:hover {
                    background-color: #52525b;
                }
            </style>
            <div class="prompt-container">
                <div class="prompt-content">
                    <div class="icon-container">
                        <svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/>
                        </svg>
                    </div>
                    
                    <div class="prompt-text">
                        <h2 class="prompt-title">Mode plein écran</h2>
                        <p class="prompt-subtitle">Voulez-vous continuer en plein écran ?</p>
                    </div>

                    <div class="button-container">
                        <button class="button accept-button">Accepter</button>
                        <button class="button decline-button">Refuser</button>
                    </div>
                </div>
            </div>
        `;

        const acceptButton = prompt.querySelector('.accept-button');
        const declineButton = prompt.querySelector('.decline-button');

        acceptButton.addEventListener('click', () => {
            this.#log('Fullscreen prompt accepted');
            this.#isTransitioningToFullscreen = true;
            this.#fullscreenButton.click();
            prompt.style.display = 'none';
        });

        declineButton.addEventListener('click', () => {
            this.#log('Fullscreen prompt declined');
            prompt.style.display = 'none';
            this.#saveState({ wasFullscreen: false });
        });
        this.#log('Showing fullscreen prompt');
        this.#fullscreenPromptShown = true;
        this.#videoContainer.appendChild(prompt);

    }
    #createEndSeriesUI() {
        const container = document.createElement('div');
        container.innerHTML = `
        <div class="series-end-container" style="
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(0, 0, 0, 0.95);
            z-index: 9999;
            opacity: 0;
            transition: opacity 0.5s ease;">
            <div class="end-content" style="
                text-align: center;
                color: white;
                max-width: 600px;
                padding: 2rem;
                transform: translateY(20px);
                transition: transform 0.5s ease;">
                <div class="end-icon" style="
                    margin-bottom: 2rem;
                    animation: pulse 2s infinite;">
                    <svg width="80" height="80" viewBox="0 0 24 24" fill="none">
                        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" 
                            stroke="currentColor" 
                            stroke-width="2" 
                            stroke-linecap="round" 
                            stroke-linejoin="round"/>
                    </svg>
                </div>
                <h2 style="
                    font-size: 2.5rem;
                    margin-bottom: 1rem;
                    font-weight: 700;">Série terminée !</h2>
                <p style="
                    font-size: 1.2rem;
                    margin-bottom: 2rem;
                    opacity: 0.8;">! Vous avez terminé toute la série.</p>
                <button class="back-button" style="
                    padding: 1rem 2rem;
                    border: 2px solid white;
                    background: transparent;
                    color: white;
                    font-size: 1.1rem;
                    border-radius: 50px;
                    cursor: pointer;
                    transition: all 0.3s ease;">Retour à l'accueil</button>
            </div>
        </div>
        <style>
            @keyframes pulse {
                0% { transform: scale(1); }
                50% { transform: scale(1.1); }
                100% { transform: scale(1); }
            }
            .series-end-container .back-button:hover {
                background: white;
                color: black;
            }
        </style>`;

        document.body.appendChild(container);

        // Animation d'entrée
        requestAnimationFrame(() => {
            container.firstElementChild.style.opacity = '1';
            container.querySelector('.end-content').style.transform = 'translateY(0)';
        });

        // Gestion du bouton retour
        container.querySelector('.back-button').addEventListener('click', () => {
            window.location.href = '/';
        });

        return container;
    }
    #updateCountdown(seconds) {
        const countdownEl = this.#toast?.querySelector('.countdown');
        if (countdownEl) {
            this.#log('Updating countdown', { seconds });
            countdownEl.textContent = Math.max(0, seconds);
        }
    }

    #showToast() {
        if (this.#toast) {
            this.#log('Showing toast');
            this.#toast.style.display = 'block';
        }
    }

    #hideToast() {
        if (this.#toast) {
            this.#log('Hiding toast');
            this.#toast.style.display = 'none';
        }
    }

    #goToNextEpisode() {
        this.#log('Attempting to go to next episode', {
            nextButtonExists: Boolean(this.#nextButton),
            wasFullscreen: this.#wasFullscreen
        });

        if (!this.#nextButton) {
            this.#log('Next button not found, cannot proceed');
            return;
        }

        this.#saveState({
            shouldAutoPlay: true,
            wasFullscreen: this.#wasFullscreen
        });

        this.#log('Clicking next episode button');
        this.#nextButton.click();
    }

    #skipToEnd() {
        if (!this.#videoElement || !this.#videoElement.duration) {
            this.#log('Cannot skip: video element or duration not available');
            return false;
        }

        try {
            const secondsFromEnd = 15;
            const newTime = this.#videoElement.duration - secondsFromEnd;

            const onSeeked = () => {
                this.#videoElement.play()
                    .catch(error => this.#log('Error playing video after seek', { error: error.message }));
                this.#videoElement.removeEventListener('seeked', onSeeked);
            };

            this.#videoElement.addEventListener('seeked', onSeeked);
            this.#videoElement.currentTime = newTime;

            this.#log('Skipped to seconds before end', {
                newTime,
                secondsFromEnd,
                totalDuration: this.#videoElement.duration
            });
            return true;
        } catch (error) {
            this.#log('Error while skipping video', { error: error.message });
            return false;
        }
    }
    stop() {
        this.#log('Stopping AutoPlayManager');

        // Arrêt des vérifications de progression
        if (this.#checkIntervalId) {
            cancelAnimationFrame(this.#checkIntervalId);
            this.#checkIntervalId = null;
        }

        // Nettoyage des event listeners
        const controller = this.#eventListeners.get(this);
        if (controller) {
            controller.abort();
            this.#eventListeners.delete(this);
        }

        // Suppression du toast s'il existe
        if (this.#toast) {
            this.#toast.remove();
            this.#toast = null;
        }

        this.#videoElement = null;
        this.#nextButton = null;
        this.#fullscreenButton = null;
        this.#playButton = null;
        this.#videoContainer = null;

        this.#wasFullscreen = false;
        this.#fullscreenRequested = false;
        this.#fullscreenPromptShown = false;
        this.#isTransitioningToFullscreen = false;

        this.#saveState({
            shouldAutoPlay: false,
            wasFullscreen: false
        });

        this.#log('AutoPlayManager stopped successfully');
        return true;
    }

}
// Initialize the manager
let autoPlayManager = new AutoPlayManager();
// Réinitialisation en cas d'erreur de lecture
if (autoPlayManager.init() === false) {
    autoPlayManager.stop();
    autoPlayManager = null;
}
