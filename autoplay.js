// Configuration
const config = {
    nextEpisodeButtonSelector: '.btn[title="épisode suivant"]',
    videoContainerSelector: '.rmp-container',
    videoPlayerSelector: '.rmp-video',
    fullscreenButtonSelector: '.rmp-fullscreen',
    playButtonSelector: '.rmp-play-pause',
    checkInterval: 1000,
    timeBeforeEndThreshold: 90,
    debugMode: false
};

class AutoPlayManager {
    constructor() {
        this.videoElement = null;
        this.nextButton = null;
        this.checkIntervalId = null;
        this.wasFullscreen = this.loadState().wasFullscreen || false;
        this.debug = config.debugMode;
        this.fullscreenRequested = false;
        this.videoContainer = null;
        this.fullscreenPromptShown = false;
        this.isTransitioningToFullscreen = false;
        this.toast = null;
        this.log('Constructor initialized', {
            wasFullscreen: this.wasFullscreen,
            debugMode: this.debug
        });
    }

    saveState(state) {
        this.log('Saving state', state);
        localStorage.setItem('autoPlayState', JSON.stringify(state));
    }

    loadState() {
        try {
            return JSON.parse(localStorage.getItem('autoPlayState')) || {};
        } catch {
            this.log('Error loading state', { error: error.message });
            return {};
        }
    }

    log(message) {
        if (this.debug){
            const timestamp = new Date().toISOString();
            console.log(`[AutoPlay ${timestamp}] ${message}`);
        }
    }

    init() {
        this.log('Initializing AutoPlayManager');
        this.findElements();
        if (this.videoElement) {
            this.setupEventListeners();
            this.log('Manager initialized with elements', {
                videoFound: !!this.videoElement,
                nextButtonFound: !!this.nextButton,
                fullscreenButtonFound: !!this.fullscreenButton,
                playButtonFound: !!this.playButton,
                containerFound: !!this.videoContainer
            });
            this.autoPlayIfNeeded();
            this.createToastElement();
        }
        else {
            this.log('Initialization failed - video element not found');
        }
    }

    createToastElement() {
        this.log('Creating toast element');
        const toast = document.createElement('div');
        toast.innerHTML = `
            <div class="next-episode-toast" style="display: none; position: absolute; bottom: 80px; right: 20px; 
                background: rgba(0, 0, 0, 0.9); color: white; padding: 20px; border-radius: 8px; z-index: 9999;
                font-family: Arial, sans-serif;">
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
        
        this.toast = toast.firstElementChild;
        this.videoContainer.appendChild(this.toast);

        this.log('Toast element created and added to container');

        // Event listeners for buttons
        this.toast.querySelector('.skip-credits').addEventListener('click', () => {            this.log('Skip credits button clicked');this.goToNextEpisode()});
        this.toast.querySelector('.next-episode').addEventListener('click', () => {this.log('Next episode button clicked'); this.goToNextEpisode()});
    }

    createFullscreenPrompt() {
        this.log('Creating fullscreen prompt');
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
            this.log('Fullscreen prompt accepted');
            this.isTransitioningToFullscreen = true;
            this.fullscreenButton.click();
            prompt.style.display = 'none';
        });

        declineButton.addEventListener('click', () => {
            this.log('Fullscreen prompt declined');
            prompt.style.display = 'none';
            this.saveState({ wasFullscreen: false });
        });

        return prompt;
    }

    findElements() {
        this.videoElement = document.querySelector(config.videoPlayerSelector);
        this.nextButton = document.querySelector(config.nextEpisodeButtonSelector);
        this.fullscreenButton = document.querySelector(config.fullscreenButtonSelector);
        this.playButton = document.querySelector(config.playButtonSelector);
        this.videoContainer = document.querySelector(config.videoContainerSelector);
        this.log('Elements found', {
            videoElement: !!this.videoElement,
            nextButton: !!this.nextButton,
            fullscreenButton: !!this.fullscreenButton,
            playButton: !!this.playButton,
            videoContainer: !!this.videoContainer
        });
    }

    autoPlayIfNeeded() {
        const state = this.loadState();
        this.log('Checking if autoplay needed', { state });
        
        if (state.shouldAutoPlay) {
            this.log('Auto-resuming after page change');
            if (this.playButton) {
                this.playButton.click();
                if (state.wasFullscreen && !this.fullscreenPromptShown) {
                    this.log('Showing fullscreen prompt');
                    this.fullscreenPromptShown = true;
                    const prompt = this.createFullscreenPrompt();
                    this.videoContainer.appendChild(prompt);
                }
            }
            else {
                this.log('Play button not found for auto-play');
            }
            this.saveState({ shouldAutoPlay: false });
        }
    }
    setupEventListeners() {
        this.log('Setting up event listeners');
        this.checkIntervalId = setInterval(() => this.checkVideoProgress(), config.checkInterval);
        
        document.addEventListener('fullscreenchange', () => {
            const isFullscreen = !!document.fullscreenElement;
            this.log('Fullscreen state changed', { 
                isFullscreen,
                wasFullscreen: this.wasFullscreen,
                isTransitioning: this.isTransitioningToFullscreen 
            });
            
            this.wasFullscreen = isFullscreen;
            this.saveState({ wasFullscreen: isFullscreen });
            
            if (isFullscreen && this.videoElement.paused && this.isTransitioningToFullscreen) {
                this.log('Auto-playing video after fullscreen transition');
                this.videoElement.play();
                this.isTransitioningToFullscreen = false;
            }
            
            this.fullscreenRequested = false;
        });

        if (this.videoElement) {
            this.videoElement.addEventListener('ended', () => {
                this.log('Video ended event triggered');
                this.goToNextEpisode();
            });
        }
    }

    checkVideoProgress() {
        if (!this.videoElement || !this.nextButton) {
            this.log('Missing required elements for progress check', {
                videoElement: !!this.videoElement,
                nextButton: !!this.nextButton
            });
            return;
        }
        
        const timeRemaining = this.videoElement.duration - this.videoElement.currentTime;
        const currentTime = this.videoElement.currentTime;
        const duration = this.videoElement.duration;

        this.log('Video progress check', {
            currentTime: currentTime.toFixed(2),
            duration: duration.toFixed(2),
            timeRemaining: timeRemaining.toFixed(2),
            isPaused: this.videoElement.paused
        });

        if (timeRemaining <= config.timeBeforeEndThreshold) {
            this.log('Approaching video end, showing toast');
            this.showToast();
            this.updateCountdown(Math.floor(timeRemaining));
        } else {
            this.hideToast();
        }
        
        if (timeRemaining <= 0 && !this.videoElement.paused) {
            this.log('Video ended naturally, going to next episode');
            this.goToNextEpisode();
        }
    }

    updateCountdown(seconds) {
        const countdownEl = this.toast.querySelector('.countdown');
        if (countdownEl) {
            this.log('Updating countdown', { seconds });
            countdownEl.textContent = Math.max(0, seconds);
        }
    }
    
    showToast() {
        if (this.toast) {
            this.log('Showing toast');
            this.toast.style.display = 'block';
        }
    }

    hideToast() {
        if (this.toast) {
            this.log('Hiding toast');
            this.toast.style.display = 'none';
        }
    }

    goToNextEpisode() {
        this.log('Attempting to go to next episode', {
            nextButtonExists: !!this.nextButton,
            wasFullscreen: this.wasFullscreen
        });
        
        if (!this.nextButton) {
            this.log('Next button not found, cannot proceed');
            return;
        }
        
        this.saveState({
            shouldAutoPlay: true,
            wasFullscreen: this.wasFullscreen
        });
        
        this.log('Clicking next episode button');
        this.nextButton.click();
    }

    stop() {
        this.log('Stopping AutoPlayManager');
        if (this.checkIntervalId) {
            clearInterval(this.checkIntervalId);
            this.checkIntervalId = null;
        }
        if (this.toast) {
            this.toast.remove();
            this.toast = null;
        }
        this.log('AutoPlayManager stopped successfully');
    }
}

// Initialize the manager
const autoPlayManager = new AutoPlayManager();
autoPlayManager.init();