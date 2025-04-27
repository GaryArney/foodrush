// Define Constants directly in game.js again
const GRID_WIDTH = 6;
const GRID_HEIGHT = 6;
const TILE_SIZE = 60; 
const UI_AREA_HEIGHT = 160; 
const ITEM_TYPES_TO_USE = 10; 
const COLORS = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff]; 

// Visual Constants for Grid Items
const BG_SIZE = TILE_SIZE * 0.9;
const CORNER_RADIUS = 10;
const SPRITE_SIZE = TILE_SIZE * 0.75;
const APPEAR_DURATION = 250; // Duration for appear animation - REINSTATED

// --- New Order System Config ---
const MAX_ACTIVE_ORDERS = 5;
const ORDER_GENERATION_INTERVAL = 5000; // milliseconds (1 minute)
const TOTAL_ORDERS_TO_WIN = 25; // Changed from 5
// Level thresholds: index = level - 2, value = orders needed to reach level
const LEVEL_THRESHOLDS = [5, 10, 15]; // Reach Lvl 2 at 5, Lvl 3 at 10, Lvl 4 at 15
const MAX_ORDER_LENGTH = 5; // Absolute max items per order
const INITIAL_ORDER_LENGTH = 1;
// --- End New Order System Config ---

// UPDATED Sprite names to match new images
const SPRITE_NAMES = [
    "Apple", "Avocado", "Bacon", "Banana", "Basil",          // 0-4
    "Beer", "Beet", "Bell Pepper", "Blueberry", "Acorn"     // 5-9
];

let game;

class BootScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BootScene' });
    }

    preload() {
        console.log("BootScene: Preloading assets...");
        // Load individual images instead of spritesheet
        console.log("BootScene: Loading individual item images...");
        this.load.image('item_0', 'sprites/Apple/apple-outline-64.png');
        this.load.image('item_1', 'sprites/Avocado/avocado-outline-64.png');
        this.load.image('item_2', 'sprites/Bacon/bacon-outline-64.png');
        this.load.image('item_3', 'sprites/Banana/banana-outline-64.png');
        this.load.image('item_4', 'sprites/Basil/basil-outline-64.png');
        this.load.image('item_5', 'sprites/Beer/beer-outline-64.png');
        this.load.image('item_6', 'sprites/Beet/beet-outline-64.png');
        this.load.image('item_7', 'sprites/Bell Pepper/bell-pepper-red-outline-64.png');
        this.load.image('item_8', 'sprites/Blueberry/blueberry-outline-64.png');
        this.load.image('item_9', 'sprites/Acorn/acorn-outline-64.png');

        console.log("BootScene: Preloading sounds...");
        this.load.audio('swapSound', 'sounds/swap.mp3');
        this.load.audio('matchSound', 'sounds/match.mp3');
        this.load.audio('bgm', 'sounds/bgm(reddish).mp3');
        this.load.audio('moveSound', 'sounds/move.mp3');

        // --- Load Player Spritesheet ---
        console.log("BootScene: Loading player spritesheet...");
        this.load.spritesheet('player_idle', 'sprites/Player/FPlayer 1 idle.png', {
            frameWidth: 48,   // Updated frame width to 48
            frameHeight: 48   // Updated frame height to 48
        });
        // --- End Player Spritesheet Loading ---

        // --- Load Player Walking Spritesheet ---
        console.log("BootScene: Loading player walking spritesheet...");
        this.load.spritesheet('player_walk', 'sprites/Player/FPlayer 1 walking.png', {
            frameWidth: 48,   // Assuming same frame width
            frameHeight: 48   // Assuming same frame height
        });
        // --- End Player Walking Spritesheet Loading ---
    }

    create() {
        console.log("BootScene: Assets loaded, starting GameScene...");
        this.scene.start('GameScene');
    }
}

class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene' });
        this.grid = [];
        this.items = null;
        this.selectedItem = null;
        this.canSwap = true;

        // Item Generation Bag
        this.itemGenerationBag = [];
        this.itemPoolIndices = Array.from({ length: 10 }, (_, i) => i); // 0-9

        // --- New Order System Properties ---
        this.activeOrders = [];       // Holds the currently displayed orders
        this.totalOrdersToWin = TOTAL_ORDERS_TO_WIN; // Use constant
        this.isGameWon = false;
        this.completedOrders = 0;
        this.orderGenerationTimer = null; // Timer for new orders
        this.nextOrderId = 0;         // Counter for unique order IDs
        // --- End New Order System Properties ---

        // Hint System
        this.hintedItems = new Set();
        this.availableHintColors = [];
        this.currentHintColorIndex = 0;
        this.hintTimer = null;
        this.hintedOrderSprites = new Set();
    }

    preload() {
        // Assets should be loaded in BootScene
    }

    create() {
        console.log("GameScene: Creating...");

        // Reset states
        this.isGameWon = false;
        this.completedOrders = 0;
        this.nextOrderId = 0;
        this.activeOrders = [];

        // Clear previous display groups if they exist
        if (this.orderDisplayGroup) {
            this.orderDisplayGroup.clear(true, true);
        }
        if (this.winScreenGroup) {
            this.winScreenGroup.destroy(true); // Destroy group and children
        }
        if (this.items) {
             // Ensure items and their backgrounds are cleared (safety check)
            this.items.getChildren().forEach(itemSprite => {
                 if (itemSprite && itemSprite.getData) {
                    const background = itemSprite.getData('background');
                    if (background && background.destroy) {
                         try { background.destroy(); } catch (e) {}
                    }
                 }
            });
            this.items.clear(true, true);
        }

        // Create fresh groups
        this.items = this.add.group();
        this.orderDisplayGroup = this.add.group();
        this.refillItemGenerationBag();

        // Play background music
        this.sound.play('bgm', { loop: true, volume: 0.3 });

        // --- UI Setup (Order Display Area & Counter) ---
        // Note: Order display is now handled by _drawOrderUI
        const uiXPadding = 10;
        const uiYPadding = 10;
        this.uiDepth = 5; // Make accessible for _drawOrderUI

        this.completedOrdersText = this.add.text(
            this.game.config.width - uiXPadding,
            uiYPadding,
            `Completed: ${this.completedOrders}/${this.totalOrdersToWin}`,
            { fontSize: '14px', fill: '#0f0', align: 'right' }
        ).setOrigin(1, 0).setDepth(this.uiDepth);

        // --- Define Player Animations (8 Directions) ---
        const directions = [
            'left', 'right', 'facing', 'away',
            'diag_left', 'diag_right', 'away_left', 'away_right'
        ];
        const framesPerRow = 4; // 4 columns
        directions.forEach((dir, rowIndex) => {
            const startFrame = rowIndex * framesPerRow;
            this.anims.create({
                key: `player_idle_${dir}`, // e.g., player_idle_left
                frames: this.anims.generateFrameNumbers('player_idle', { start: startFrame, end: startFrame + framesPerRow - 1 }),
                frameRate: 6, // Adjust frame rate for individual animations if needed
                repeat: -1 // Loop this direction's animation
            });
        });
        console.log("GameScene: Created 8 directional player idle animations.");

        // Define Walking Animations
        directions.forEach((dir, rowIndex) => {
            const startFrame = rowIndex * framesPerRow;
            this.anims.create({
                key: `player_walk_${dir}`, // e.g., player_walk_left
                frames: this.anims.generateFrameNumbers('player_walk', { start: startFrame, end: startFrame + framesPerRow - 1 }),
                frameRate: 8, // Adjust frame rate for walking if needed
                repeat: -1 // Loop this direction's walking animation
            });
        });
        console.log("GameScene: Created 8 directional player walking animations.");
        // --- End Define Player Animations ---

        // --- Add Player Sprite ---
        this.playerSprite = this.add.sprite( // Store sprite reference on 'this'
            this.completedOrdersText.x - this.completedOrdersText.width / 2, // Align center with text
            this.completedOrdersText.y + this.completedOrdersText.height + 10, // Below text + padding
            'player_idle' // Use spritesheet key
            // REMOVED frame index 0
        ).setOrigin(0.5, 0.5).setDepth(4); // Keep origin center (0.5, 0.5)
        this.playerSprite.setScale(2); // Keep the sprite larger
        this.playerSprite.play('player_idle_facing'); // Start with 'facing' animation
        console.log(`GameScene: Added player sprite, playing 'player_idle_facing', scaled by 2, centered origin.`);

        // --- Timer to change player direction ---
        this.playerDirectionTimer = this.time.addEvent({
            delay: 3000, // 3 seconds
            callback: this.updatePlayerState, // Renamed function
            callbackScope: this,
            loop: true
        });
        console.log("GameScene: Started player state update timer (3s).");
        // --- End Timer Setup ---

        // --- Player Movement Boundaries & State ---
        this.playerMovement = {
            isMoving: false,
            targetX: this.playerSprite.x,
            targetY: this.playerSprite.y,
            minX: 0, // Placeholder
            maxX: 0, // Placeholder
            minY: 0, // Placeholder
            maxY: 0, // Placeholder
            speed: 50 // Pixels per second, adjust as needed
        };

        // Calculate boundaries after sprite exists
        const playerScaledWidth = this.playerSprite.displayWidth;
        const playerScaledHeight = this.playerSprite.displayHeight;
        const gridActualWidth = GRID_WIDTH * TILE_SIZE;
        const gridScreenX = (this.game.config.width - gridActualWidth) / 2;
        const gridRightEdge = gridScreenX + gridActualWidth;
        const padding = 10;

        // --- Re-Revised Horizontal Boundaries ---
        // Max X: Game width minus padding and half sprite width
        this.playerMovement.maxX = this.game.config.width - padding - (playerScaledWidth / 2);
        // Min X: Grid right edge plus padding and half sprite width
        this.playerMovement.minX = gridRightEdge + padding + (playerScaledWidth / 2);
        // --- End Re-Revised Horizontal Boundaries ---

        // Keep Y within the top UI area
        this.playerMovement.minY = padding + (playerScaledHeight / 2); // Top padding + half height
        this.playerMovement.maxY = UI_AREA_HEIGHT - padding - (playerScaledHeight / 2); // Bottom of UI area - padding - half height

        // Ensure min/max are valid
        if (this.playerMovement.minX > this.playerMovement.maxX) {
            // If grid edge + padding pushes past screen edge - padding, clamp minX to maxX
            console.warn("[Player Bounds] minX calculated past maxX. Clamping minX to maxX.");
            this.playerMovement.minX = this.playerMovement.maxX;
        }
        if (this.playerMovement.minY > this.playerMovement.maxY) {
             // If UI area is too small, fix Y
             this.playerMovement.minY = UI_AREA_HEIGHT / 2;
             this.playerMovement.maxY = UI_AREA_HEIGHT / 2;
        }
        // Set initial target within new bounds if needed
        this.playerMovement.targetX = Phaser.Math.Clamp(this.playerSprite.x, this.playerMovement.minX, this.playerMovement.maxX);
        this.playerMovement.targetY = Phaser.Math.Clamp(this.playerSprite.y, this.playerMovement.minY, this.playerMovement.maxY);
        this.playerSprite.setPosition(this.playerMovement.targetX, this.playerMovement.targetY); // Move sprite into bounds immediately

        console.log("Player Movement Boundaries (UI Area):", this.playerMovement);
        // --- End Player Movement Boundaries ---

        // --- Grid Setup ---
        this.createGridData();
        this.drawGrid();
        this.setupInput();

        // --- Win Screen Setup ---
        this.winScreenGroup = this.add.group();
        const winBg = this.add.rectangle(this.game.config.width / 2, this.game.config.height / 2, this.game.config.width * 0.8, 150, 0x000000, 0.85).setDepth(10);
        const winText = this.add.text(this.game.config.width / 2, this.game.config.height / 2, `All orders filled!\nClick to Continue`,
            { fontSize: '28px', fill: '#0f0', align: 'center', padding: 10 }
        ).setOrigin(0.5).setDepth(11);
        this.winScreenGroup.addMultiple([winBg, winText]);
        this.winScreenGroup.setVisible(false);

        // --- Initial Game State ---
        this.generateInitialOrder(); // Generate the first order
        this._drawOrderUI();         // Draw initial order UI
        this.startOrderGenerationTimer(); // Start the timer for subsequent orders
        this.canSwap = true;

        // Initial hint check
        this.time.delayedCall(100, this.checkForHints, [], this);
    }

    update(time, delta) {
       // Update static order display for COMPLETION
        this.activeOrders.forEach(order => {
            // Ensure label and sprites exist
            if (order.displayLabel && order.displaySprites.length > 0) { 
                if (order.completed) {
                    // Apply visual cue to completed order (e.g., tint sprites)
                    if (order.displaySprites[0].tintTopLeft !== 0x88ff88) { // Check tint only once
                        order.displayLabel.setAlpha(0.6);
                        order.displaySprites.forEach(sprite => {
                            sprite.setTint(0x88ff88); // Apply green tint
                            sprite.setAlpha(0.6);
                        });
                    }
                } else {
                    // Reset visual cue if previously completed (e.g., on restart)
                     if (order.displaySprites[0].tintTopLeft === 0x88ff88) { // Check tint
                         order.displayLabel.setAlpha(1);
                         order.displaySprites.forEach(sprite => {
                            sprite.clearTint();
                            sprite.setAlpha(1);
                        });
                    }
                }
            }
        });
    }

    // --- Game Setup Methods ---
    refillItemGenerationBag() {
        console.log("Refilling item generation bag (Indices 0-9)...");
        this.itemGenerationBag = [...this.itemPoolIndices];
        Phaser.Utils.Array.Shuffle(this.itemGenerationBag);
    }
    createGridData() {
        console.log("Creating grid data structure using bag generation...");
        this.grid = [];
        for (let y = 0; y < GRID_HEIGHT; y++) {
            this.grid[y] = [];
            for (let x = 0; x < GRID_WIDTH; x++) {
                this.grid[y][x] = this.generateNonMatchingItem(x, y);
            }
        }
        // Prevent initial matches, but DON'T enable swap here
        this.preventAutoMatches( [], false ); 
        console.log("Grid data created.");
    }
    generateNonMatchingItem(x, y) {
        let potentialItem; let loops = 0; const maxColorLoops = COLORS.length * 2; let spriteIndex; let color;
        if (this.itemGenerationBag.length === 0) { this.refillItemGenerationBag(); }
        spriteIndex = this.itemGenerationBag.pop();
        do { color = Phaser.Utils.Array.GetRandom(COLORS); loops++;
            if (loops > maxColorLoops) { console.warn(`generateNonMatchingItem: Could not find non-matching color for sprite ${spriteIndex+1} at (${x}, ${y}).`); break; }
        } while (this.checkMatchAt(x, y, color));
        potentialItem = { spriteIndex: spriteIndex, color: color, sprite: null, x: x, y: y };
        return potentialItem;
    }
    checkMatchAt(x, y, color) {
        let countH = 1;
        if (x > 0 && this.grid[y]?.[x-1]?.color === color) { countH++; if (x > 1 && this.grid[y]?.[x-2]?.color === color) countH++; }
        if (x < GRID_WIDTH - 1 && this.grid[y]?.[x+1]?.color === color) { countH++; if (x < GRID_WIDTH - 2 && this.grid[y]?.[x+2]?.color === color) countH++; }
        if (x > 0 && x < GRID_WIDTH - 1 && this.grid[y]?.[x-1]?.color === color && this.grid[y]?.[x+1]?.color === color) { return true; }
        if (countH >= 3) return true;
        let countV = 1;
        if (y > 0 && this.grid[y-1]?.[x]?.color === color) { countV++; if (y > 1 && this.grid[y-2]?.[x]?.color === color) { countV++; } }
        if (y < GRID_HEIGHT - 1 && this.grid[y+1]?.[x]?.color === color) { countV++; if (y < GRID_HEIGHT - 2 && this.grid[y+2]?.[x]?.color === color) { countV++; } }
        if (y > 0 && y < GRID_HEIGHT - 1 && this.grid[y-1]?.[x]?.color === color && this.grid[y+1]?.[x]?.color === color) { return true; }
        if (countV >= 3) return true;
        return false;
    }

    // Modified drawGrid for UI offset, centering, and rounded corners
    drawGrid() {
        console.log("Drawing grid visuals...");
        const initialSprites = [];
        const initialBackgrounds = []; // Restore background array

        for (let y = 0; y < GRID_HEIGHT; y++) {
            for (let x = 0; x < GRID_WIDTH; x++) {
                const gridItem = this.grid[y][x];
                if (!gridItem) { console.error(`Null item at (${x},${y}) in drawGrid`); continue; }

                // Create visuals (sets scale/alpha to 0) but don't tween yet
                // _createGridItemVisuals now returns an object { sprite, background }
                const visuals = this._createGridItemVisuals(gridItem, x, y);
                if (visuals.sprite) { // Check if sprite was created
                    initialSprites.push(visuals.sprite);
                }
                if (visuals.background) { // Check if background was created
                     initialBackgrounds.push(visuals.background);
                }
            }
        }

        // Start Simultaneous Appear Tweens for initial grid
        // Check both arrays
        if (initialSprites.length > 0 || initialBackgrounds.length > 0) {
            // Tween backgrounds if they exist
            if (initialBackgrounds.length > 0) {
                this.tweens.add({
                    targets: initialBackgrounds,
                    scaleX: 1, scaleY: 1, alpha: 1, // Background scales to 1
                    duration: APPEAR_DURATION,
                    ease: 'Power2'
                });
            }

            // Tween sprites if they exist
             if (initialSprites.length > 0) {
                 this.tweens.add({
                    targets: initialSprites,
                     // Directly tween displayWidth and displayHeight instead of scale
                     displayWidth: SPRITE_SIZE,
                     displayHeight: SPRITE_SIZE,
                     alpha: 1,
                     duration: APPEAR_DURATION,
                     ease: 'Power2'
                 });
             }
        }

        console.log("Grid visuals drawn.");
    }

    setupInput() {
        console.log("Setting up input handlers...");
        this.input.on('gameobjectdown', this.onItemDown, this);
        this.input.on('gameobjectover', this.onItemOver, this);
        this.input.on('pointerup', this.onPointerUp, this); // Use global pointer up

        // We need drag state tracking outside of individual items
        this.isDragging = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.dragEndX = 0;
        this.dragEndY = 0;
    }

    // --- Input Handling Methods ---
    onItemDown(pointer, gameObject) {
        if (!this.canSwap || !gameObject.getData('gridData')) return; // Ensure it's a grid item and swapping is allowed

        this.selectedItem = gameObject;
        this.isDragging = true;
        this.dragStartX = pointer.x;
        this.dragStartY = pointer.y;
        console.log("Item down:", this.selectedItem.getData('gridData').x, this.selectedItem.getData('gridData').y);
    }
    onItemOver(pointer, gameObject) {
        if (!this.isDragging || !this.selectedItem || gameObject === this.selectedItem || !gameObject.getData('gridData')) {
            return; // Only interested if dragging over a *different* grid item
        }

        const item1Data = this.selectedItem.getData('gridData');
        const item2Data = gameObject.getData('gridData');

        // Check if the items are adjacent (horizontally or vertically)
        const dx = Math.abs(item1Data.x - item2Data.x);
        const dy = Math.abs(item1Data.y - item2Data.y);

        if ((dx === 1 && dy === 0) || (dx === 0 && dy === 1)) {
            console.log("Adjacent item hovered:", item2Data.x, item2Data.y);
            // Initiate the swap immediately upon dragging over adjacent tile
            this.attemptSwap(this.selectedItem, gameObject);
            // Reset drag state after attempting swap
            this.isDragging = false;
            this.selectedItem = null;
        }
    }
    onPointerUp(pointer) {
        // If dragging stops without hovering over an adjacent item, reset state
        if (this.isDragging) {
            console.log("Pointer up without valid swap target.");
            this.isDragging = false;
            this.selectedItem = null;
        }
    }

    // --- Game Logic Methods ---
    attemptSwap(item1, item2) {
        if (!this.canSwap) return;
        this.canSwap = false; // Prevent further swaps immediately

        // --- FIX: Stop ALL hints (including timer) before starting swap ---
        console.log("[AttemptSwap] Stopping all hints before swap.");
        this.stopAllHints();
        // --- END FIX ---

        // Reset alpha just in case (stopAllHints should handle hinted items, but doesn't hurt)
        item1.setAlpha(1);
        item2.setAlpha(1);

        this.sound.play('moveSound', { volume: 0.5 });

        const item1Data = item1.getData('gridData');
        const item2Data = item2.getData('gridData');

        this.swapItemsVisually(item1, item2, () => {
            // Update grid data structure
            this.grid[item1Data.y][item1Data.x] = item2Data;
            this.grid[item2Data.y][item2Data.x] = item1Data;

            // Update coordinates within item data
            const tempX = item1Data.x;
            const tempY = item1Data.y;
            item1Data.x = item2Data.x;
            item1Data.y = item2Data.y;
            item2Data.x = tempX;
            item2Data.y = tempY;

            // Check for matches resulting from the swap
            const matches1 = this.findMatchesInvolving(item1Data.x, item1Data.y);
            const matches2 = this.findMatchesInvolving(item2Data.x, item2Data.y);
            const allMatches = [...new Set([...matches1, ...matches2])];

            if (allMatches.length > 0) {
                console.log("[AttemptSwap] Swap resulted in matches. Processing...");
                this.processMatches(allMatches); // processMatches handles its own hint logic internally
            } else {
                // No match occurred after swap
                console.log("[AttemptSwap] No match after swap. Re-enabling swap and checking hints.");
                this.canSwap = true;
                // Check for hints AFTER board is stable (swap animation finished)
                // Reduced delay slightly as APPEAR_DURATION isn't relevant here
                this.time.delayedCall(50, this.checkForHints, [], this); 
            }
        });
    }
    
    // Modified swapItemsVisually for Graphics objects
    swapItemsVisually(item1, item2, onCompleteCallback) {
        const item1Data = item1.getData('gridData');
        const item2Data = item2.getData('gridData');
        if (!item1Data || !item2Data) return;

        // Get target world positions using helper
        const targetPos1 = this.getWorldCoordinatesFromGrid(item2Data.x, item2Data.y);
        const targetPos2 = this.getWorldCoordinatesFromGrid(item1Data.x, item1Data.y);

        // Tween item1 to targetPos1
        this.tweens.add({
            targets: item1, // Target the sprite
            x: targetPos1.x,
            y: targetPos1.y,
            duration: 200,
            ease: 'Power2',
            onUpdate: (tween, target) => { // Restore background position update during tween
                 this._setGridItemVisualPosition(target, target.x, target.y);
            },
            onComplete: (tween, targets) => { // Ensure final position is exact
                targets.forEach(target => this._setGridItemVisualPosition(target, targetPos1.x, targetPos1.y));
            }
        });

        // Tween item2 to targetPos2
        this.tweens.add({
            targets: item2, // Target the sprite
            x: targetPos2.x,
            y: targetPos2.y,
            duration: 200,
            ease: 'Power2',
            onUpdate: (tween, target) => { // Restore background position update during tween
                 this._setGridItemVisualPosition(target, target.x, target.y);
            },
             onComplete: (tween, targets) => {
                targets.forEach(target => this._setGridItemVisualPosition(target, targetPos2.x, targetPos2.y));
                if (onCompleteCallback) onCompleteCallback(); // Call original callback
            }
        });
    }

    findMatchesInvolving(x, y) {
        const item = this.grid[y][x];
        if (!item) return []; // Should not happen if called correctly

        const colorToMatch = item.color;
        let horizontalMatches = [item]; // Start with the item itself
        let verticalMatches = [item];   // Start with the item itself

        // --- Check Horizontal --- (Left and Right)
        // Check Left
        for (let i = x - 1; i >= 0; i--) {
            const neighbor = this.grid[y][i];
            if (neighbor && neighbor.color === colorToMatch) {
                horizontalMatches.push(neighbor);
            } else {
                break; // Stop if color doesn't match or out of bounds
            }
        }
        // Check Right
        for (let i = x + 1; i < GRID_WIDTH; i++) {
            const neighbor = this.grid[y][i];
            if (neighbor && neighbor.color === colorToMatch) {
                horizontalMatches.push(neighbor);
            } else {
                break; // Stop if color doesn't match or out of bounds
            }
        }

        // --- Check Vertical --- (Up and Down)
        // Check Up
        for (let i = y - 1; i >= 0; i--) {
            const neighbor = this.grid[i][x];
            if (neighbor && neighbor.color === colorToMatch) {
                verticalMatches.push(neighbor);
            } else {
                break; // Stop if color doesn't match or out of bounds
            }
        }
        // Check Down
        for (let i = y + 1; i < GRID_HEIGHT; i++) {
            const neighbor = this.grid[i][x];
            if (neighbor && neighbor.color === colorToMatch) {
                verticalMatches.push(neighbor);
            } else {
                break; // Stop if color doesn't match or out of bounds
            }
        }

        let finalMatches = [];
        // If a horizontal match of 3 or more was found, add it
        if (horizontalMatches.length >= 3) {
            finalMatches = finalMatches.concat(horizontalMatches);
        }
        // If a vertical match of 3 or more was found, add it
        if (verticalMatches.length >= 3) {
             // Avoid adding duplicates if an item is part of both H and V match
             verticalMatches.forEach(matchItem => {
                 if (!finalMatches.includes(matchItem)) {
                     finalMatches.push(matchItem);
                 }
             });
        }

        // console.log(`Matches found involving (${x}, ${y}):`, finalMatches.length > 0 ? finalMatches.map(i => `(${i.x},${i.y})`) : 'None');
        return finalMatches; // Return array of grid data objects
    }

    findMatches() {
        let allMatches = [];
        const checkedItems = new Set(); // Use a Set to avoid adding the same item multiple times

        // Check Horizontally
        for (let y = 0; y < GRID_HEIGHT; y++) {
            for (let x = 0; x < GRID_WIDTH - 2; x++) {
                const item1 = this.grid[y][x];
                if (!item1) continue; // Skip null spots

                const item2 = this.grid[y][x + 1];
                const item3 = this.grid[y][x + 2];

                if (item2 && item3 && item1.color === item2.color && item1.color === item3.color) {
                    let currentMatch = [item1, item2, item3];
                    // Check for longer matches
                    for (let i = x + 3; i < GRID_WIDTH; i++) {
                        const nextItem = this.grid[y][i];
                        if (nextItem && nextItem.color === item1.color) {
                            currentMatch.push(nextItem);
                        } else {
                            break;
                        }
                    }
                    // Add found items to the overall list and the checked set
                    currentMatch.forEach(matchItem => {
                        if (!checkedItems.has(matchItem)) {
                            allMatches.push(matchItem);
                            checkedItems.add(matchItem);
                        }
                    });
                    // Optimization: Skip checked items in this row scan
                    x += currentMatch.length - 1;
                }
            }
        }

        // Check Vertically
        for (let x = 0; x < GRID_WIDTH; x++) {
            for (let y = 0; y < GRID_HEIGHT - 2; y++) {
                const item1 = this.grid[y][x];
                 // Skip null spots AND items already part of a horizontal match found above
                if (!item1 || checkedItems.has(item1)) continue;

                const item2 = this.grid[y + 1][x];
                const item3 = this.grid[y + 2][x];

                if (item2 && item3 && item1.color === item2.color && item1.color === item3.color) {
                    let currentMatch = [item1, item2, item3];
                    // Check for longer matches
                    for (let i = y + 3; i < GRID_HEIGHT; i++) {
                        const nextItem = this.grid[i][x];
                        if (nextItem && nextItem.color === item1.color) {
                            currentMatch.push(nextItem);
                        } else {
                            break;
                        }
                    }
                    // Add found items to the overall list and the checked set
                    currentMatch.forEach(matchItem => {
                        if (!checkedItems.has(matchItem)) {
                            allMatches.push(matchItem);
                            checkedItems.add(matchItem);
                        }
                    });
                     // Optimization: Skip checked items in this column scan
                     y += currentMatch.length - 1;
                }
            }
        }
        return allMatches;
    }

    // --- Matching and Replacement Logic ---
    processMatches(matches) {
        // --- LOGGING ---
        console.log("[ProcessMatches] Start processing matches:", matches.length);
        // --- END LOGGING ---

        // Add check for gameOver state
        if (matches.length === 0 || this.isGameWon) {
             console.log("[ProcessMatches] No matches or game finished, exiting.");
            // If no matches, ensure hints are checked AFTER board state is stable
            if (!this.isGameWon && this.canSwap) {
                this.time.delayedCall(APPEAR_DURATION + 50, this.checkForHints, [], this);
            }
            return;
        }

        this.sound.play('matchSound', { volume: 0.6 });
        this.stopAllHints();
        this.canSwap = false;

        console.log(`[ProcessMatches] Found ${matches.length} matched items.`);
        const uniqueItems = [...new Set(matches)];
        const matchedIndices = uniqueItems.map(itemData => itemData.spriteIndex);
        const matchLocations = uniqueItems.map(itemData => ({ x: itemData.x, y: itemData.y }));

        let orderCompletedThisTurn = false;
        let uiSpritesToAnimate = null; // Renamed for clarity
        let completedOrderData = null; // Store the completed order object

        // --- Check Order Fulfillment ---
        console.log("[ProcessMatches] Checking order fulfillment...");
        // Iterate through a copy in case of removal during iteration (safer)
        [...this.activeOrders].forEach(order => {
            // Only check non-completed orders and only complete ONE per match event
            if (!order.completed && !orderCompletedThisTurn) {
                const allRequirementsMet = order.requiredIndices.every(reqIndex => matchedIndices.includes(reqIndex));
                if (allRequirementsMet) {
                    console.log(`[ProcessMatches] Order #${order.id} requirements met!`);
                    order.completed = true; // Mark as complete
                    this.completedOrders++;
                    this.completedOrdersText.setText(`Completed: ${this.completedOrders}/${this.totalOrdersToWin}`);

                    orderCompletedThisTurn = true;
                    uiSpritesToAnimate = order.displaySprites; // Get sprites for animation
                    completedOrderData = order; // Store the order to be removed later

                    console.log(`[ProcessMatches] Order completed this turn (ID: ${order.id}). Storing UI sprites for animation.`);

                    // Check for win immediately
                    if (this.completedOrders >= this.totalOrdersToWin) {
                         console.log("[ProcessMatches] Win condition met during order check.");
                         // Win screen triggered later
                    }
                }
            }
        });
        console.log("[ProcessMatches] Finished checking orders.");
        // --- End Order Fulfillment Check ---

        // --- Handle Animation & Clearing or Bonus ---
        if (orderCompletedThisTurn && completedOrderData) {
            // --- LOGGING ---
            console.log(`[ProcessMatches] Order #${completedOrderData.id} completed path chosen.`);
            // --- END LOGGING ---

            // Start the non-blocking UI animation
            if (uiSpritesToAnimate && uiSpritesToAnimate.length > 0) {
                this.playOrderUICompleteAnimation(uiSpritesToAnimate);
            } else {
                 console.log("[ProcessMatches] Order completed but no UI sprites found to animate?");
            }

            // Schedule removal of the completed order AFTER the pop animation might finish
            const removalDelay = 500; // Adjust as needed
            this.time.delayedCall(removalDelay, () => {
                console.log(`[ProcessMatches] Removing completed order #${completedOrderData.id}`);
                this.activeOrders = this.activeOrders.filter(o => o.id !== completedOrderData.id);
                this._drawOrderUI(); // Redraw the UI without the completed order
            }, [], this);

            // Clear the matched items *from the grid* using the standard shrink
            console.log("[ProcessMatches] Starting shrinkAndClear for matched grid items...");
            this.shrinkAndClear(uniqueItems, matchLocations);

            // Check win condition again *after* initiating the clear
            if (this.completedOrders >= this.totalOrdersToWin && !this.isGameWon) {
                console.log("[ProcessMatches] Win condition met after order completion. Scheduling triggerWin.");
                // Use a slight delay to allow shrink/removal to start
                this.time.delayedCall(400, this.triggerWinCondition, [], this);
            }
            return; // Exit: shrinkAndClear handles the grid refill callback

        } else { // No order completed, proceed with Bonus Item Mechanic
             // --- LOGGING ---
            console.log("[ProcessMatches] No order completed. Checking for bonus...");
            // --- END LOGGING ---
            let bonusItemDataToGenerate = null;

            // --- Bonus Item Logic ---
            // 1. Find largest incomplete order(s) - Uses activeOrders now
            let largestIncompleteOrderSize = 0;
            let potentialTargetOrders = [];
            this.activeOrders.forEach(order => { // Uses activeOrders
                if (!order.completed) {
                    if (order.requiredIndices.length > largestIncompleteOrderSize) {
                        largestIncompleteOrderSize = order.requiredIndices.length;
                        potentialTargetOrders = [order]; // Reset list
                    } else if (order.requiredIndices.length === largestIncompleteOrderSize) {
                        potentialTargetOrders.push(order);
                    }
                }
            });

            let bonusLogicHandledClear = false;
            if (potentialTargetOrders.length > 0) {
                const targetOrder = Phaser.Utils.Array.GetRandom(potentialTargetOrders);
                // 3. Handle Match 7+
                if (matches.length >= 7) {
                    console.log("[ProcessMatches] Match 7+ bonus: Auto-completing largest order.");
                    // --- FIX: Auto-complete logic for dynamic orders ---
                    targetOrder.completed = true;
                    this.completedOrders++;
                    this.completedOrdersText.setText(`Completed: ${this.completedOrders}/${this.totalOrdersToWin}`);
                    // Schedule removal and UI update for the auto-completed order
                     const removalDelay = 100; // Short delay
                     this.time.delayedCall(removalDelay, () => {
                        console.log(`[ProcessMatches] Removing auto-completed order #${targetOrder.id}`);
                        this.activeOrders = this.activeOrders.filter(o => o.id !== targetOrder.id);
                        this._drawOrderUI();
                     }, [], this);
                     // Play sound/visual for auto-complete?
                     this.sound.play('matchSound', { volume: 0.8, detune: -200 }); // Example sound
                    // --- END FIX ---

                    console.log("[ProcessMatches] Match 7+: Destroying original visuals...");
                    uniqueItems.forEach(itemData => {
                         if (itemData.sprite && itemData.sprite.scene) {
                            const background = itemData.sprite.getData('background');
                            try { itemData.sprite.destroy(); } catch (e) { console.warn("Match 7+ destroy error (sprite):", e); }
                            itemData.sprite = null;
                            if (background && background.scene) {
                                try { background.destroy(); } catch (e) { console.warn("Match 7+ destroy error (background):", e); }
                            }
                        } else if (itemData.sprite) { itemData.sprite = null; }
                    });

                    this.clearAndRefill(uniqueItems, matchLocations);
                    bonusLogicHandledClear = true;
                    if (this.completedOrders >= this.totalOrdersToWin && !this.isGameWon) {
                         console.log("[ProcessMatches] Match 7+: Win condition met. Triggering win.");
                         this.triggerWinCondition(); // Trigger win directly here
                    }
                } else {
                    // 4. Handle Match 3-6: Calculate bonus items
                    let numBonusItems = 0;
                    if (matches.length === 3) numBonusItems = 1;
                    else if (matches.length === 4) numBonusItems = 2;
                    else if (matches.length === 5) numBonusItems = 3;
                    else if (matches.length === 6) numBonusItems = 4;

                    if (numBonusItems > 0) {
                         console.log(`[ProcessMatches] Calculating ${numBonusItems} bonus items...`);
                        // Determine Bonus Color (targets specific order)
                        const colorCounts = {};
                        COLORS.forEach(color => colorCounts[color] = 0);
                        const targetIndices = new Set(targetOrder.requiredIndices);
                        for(let y=0; y<GRID_HEIGHT; y++) {
                            for(let x=0; x<GRID_WIDTH; x++) {
                                const item = this.grid[y]?.[x];
                                if(item && targetIndices.has(item.spriteIndex)) {
                                    colorCounts[item.color]++;
                                }
                            }
                        }
                        let maxCount = -1;
                        let bestColors = [];
                        COLORS.forEach(color => {
                            if (colorCounts[color] > maxCount) {
                                maxCount = colorCounts[color];
                                bestColors = [color];
                            } else if (colorCounts[color] === maxCount) {
                                bestColors.push(color);
                            }
                        });
                        const bonusColor = Phaser.Utils.Array.GetRandom(bestColors);
                        console.log(`[ProcessMatches] Bonus color chosen: ${bonusColor.toString(16)}`);

                        // Select Bonus Item Indices from the target order
                        const bonusItemIndices = [];
                        for (let i = 0; i < numBonusItems; i++) {
                            bonusItemIndices.push(Phaser.Utils.Array.GetRandom(targetOrder.requiredIndices));
                        }
                        console.log(`[ProcessMatches] Bonus item indices: ${bonusItemIndices.join(', ')}`);

                        // Prepare Bonus Item Data
                        bonusItemDataToGenerate = [];
                        // --- MODIFICATION: Only generate ONE bonus item max ---
                        if (numBonusItems > 0 && matchLocations.length > 0 && targetOrder.requiredIndices.length > 0) {
                             // Pick one required index from the target order
                             const singleBonusIndex = Phaser.Utils.Array.GetRandom(targetOrder.requiredIndices);
                             // Use the first match location for placement
                             const placementLoc = matchLocations[0]; 
                             bonusItemDataToGenerate.push({
                                spriteIndex: singleBonusIndex,
                                color: bonusColor,
                                x: placementLoc.x,
                                y: placementLoc.y
                             });
                             console.log(`[ProcessMatches] Prepared 1 bonus item (instead of ${numBonusItems})`);
                        }
                        // --- END MODIFICATION ---
                         // console.log(`[ProcessMatches] Prepared ${bonusItemDataToGenerate.length} bonus items.`); // Old log
                    } else {
                         console.log("[ProcessMatches] Match size doesn't qualify for bonus items.");
                    }
                }
            } else {
                 console.log("[ProcessMatches] No incomplete orders found for bonus check.");
            }

             // Clear Visuals and Refill (Based on Bonus/Normal)
             if (!bonusLogicHandledClear) {
                if (bonusItemDataToGenerate && bonusItemDataToGenerate.length > 0) {
                    console.log("[ProcessMatches] Bonus items generated. Destroying original visuals then calling clearAndRefill.");
                    uniqueItems.forEach(itemData => {
                        if (itemData.sprite && itemData.sprite.scene) {
                            const background = itemData.sprite.getData('background');
                            try { itemData.sprite.destroy(); } catch (e) { /* ignore */ }
                            itemData.sprite = null;
                            if (background && background.scene) {
                                try { background.destroy(); } catch (e) { /* ignore */ }
                            }
                        } else if (itemData.sprite) { itemData.sprite = null; }
                    });
                    this.clearAndRefill(uniqueItems, matchLocations, bonusItemDataToGenerate);
                } else {
                    console.log("[ProcessMatches] No bonus generated. Starting standard shrinkAndClear.");
                    this.shrinkAndClear(uniqueItems, matchLocations);
                }
             }
        }
        console.log("[ProcessMatches] End of function.");
    }

    // Helper for the standard shrink/clear operation
    shrinkAndClear(itemsToClear, locations) {
        // --- LOGGING ---
        console.log("[ShrinkAndClear] Start shrinking items:", itemsToClear.length);
        // --- END LOGGING ---
        let tweensCompleted = 0;
        const totalTweens = itemsToClear.length;
        const itemsDataToPass = itemsToClear.map(item => ({ x: item.x, y: item.y, spriteIndex: item.spriteIndex, color: item.color, sprite: null })); // Pass data without sprite ref

        itemsToClear.forEach(itemData => {
            if (itemData.sprite && itemData.sprite.scene) {
                this.tweens.killTweensOf(itemData.sprite);
                const background = itemData.sprite.getData('background');
                const targets = [itemData.sprite, background].filter(t => t && t.scene);
                itemData.sprite = null; // Nullify ref immediately

                if (targets.length > 0) {
                    this.tweens.add({
                        targets: targets,
                        scaleX: 0, scaleY: 0, alpha: 0,
                        duration: 300, ease: 'Power2',
                        onComplete: () => {
                            tweensCompleted++;
                            targets.forEach(target => { if (target && target.destroy) { try { target.destroy(); } catch (e) {} } });
                            if (tweensCompleted === totalTweens) {
                                // --- LOGGING ---
                                console.log("[ShrinkAndClear] Shrink tween complete. Calling clearAndRefill.");
                                // --- END LOGGING ---
                                this.clearAndRefill(itemsDataToPass, locations);
                            }
                        }
                    });
                } else {
                    tweensCompleted++;
                    if (tweensCompleted === totalTweens) {
                        console.log("[ShrinkAndClear] No valid targets for tween. Calling clearAndRefill.");
                        this.clearAndRefill(itemsDataToPass, locations);
                    }
                }
            } else {
                tweensCompleted++;
                if (tweensCompleted === totalTweens) {
                     console.log("[ShrinkAndClear] No valid sprite found. Calling clearAndRefill.");
                     this.clearAndRefill(itemsDataToPass, locations);
                }
            }
        });
        if (totalTweens === 0 && itemsToClear.length > 0) {
             console.log("[ShrinkAndClear] No items had sprites initially. Calling clearAndRefill.");
             this.clearAndRefill(itemsDataToPass, locations);
        }
    }

    // NEW Animation function using UI sprite copies
    playOrderUICompleteAnimation(originalUiSprites) {
        // --- LOGGING ---
        console.log("[PlayOrderUIAnimation] Start creating temp sprites for sequential animation.");
        // --- END LOGGING ---
        const tempSprites = [];
        const animationDepth = 100; // Ensure animation is on top

        // 1. Create temporary copies AND store target coords
        originalUiSprites.forEach(origSprite => {
             if (origSprite && origSprite.scene) {
                try {
                    const tempSprite = this.add.sprite(origSprite.x, origSprite.y, origSprite.texture.key) // Start at original position for tweening FROM
                        .setOrigin(origSprite.originX, origSprite.originY)
                        .setDisplaySize(origSprite.displayWidth, origSprite.displayHeight)
                        .setDepth(animationDepth)
                        .setAlpha(0); // Start invisible

                    // Store the final destination (original UI position)
                    tempSprite.setData('targetX', origSprite.x);
                    tempSprite.setData('targetY', origSprite.y);

                    tempSprites.push(tempSprite);
                 } catch (e) { console.error("Error creating temp sprite:", e); }
             }
        });

        if (tempSprites.length === 0) {
            console.warn("[PlayOrderUIAnimation] No temp sprites created.");
            return;
        }
         console.log(`[PlayOrderUIAnimation] Created ${tempSprites.length} temp sprites. Starting sequential tweens.`);

        // 2. Define animation parameters
        const baseWidth = tempSprites[0].displayWidth > 0 ? tempSprites[0].displayWidth : TILE_SIZE * 0.4;
        const targetScaleFactor = (TILE_SIZE * 1.0) / baseWidth; // Using 1.0 based on previous change
        const screenCenterX = this.game.config.width / 2;
        const popTargetY = UI_AREA_HEIGHT + (GRID_HEIGHT * TILE_SIZE) / 3; // Vertical center point for the pop
        const popDuration = 350; // Duration of the pop animation
        const returnDuration = 300; // Duration of the return animation
        const staggerDelay = 100; // Delay between each sprite starting its animation

        // REMOVED Multi-row layout logic

        // 3. Trigger Animations Sequentially
        tempSprites.forEach((sprite, index) => {
            // Use delayedCall to stagger the start of each sprite's animation
            this.time.delayedCall(index * staggerDelay, () => {
                 console.log(`[PlayOrderUIAnimation] Animating sprite ${index}`);

                 // Play swapSound when item pops
                 this.sound.play('swapSound', { volume: 0.4 }); // Added sound effect

                 // First Tween: Pop out near center
                 this.tweens.add({
                     targets: sprite,
                     x: screenCenterX, // Move to center X
                     y: popTargetY,    // Move to center Y
                     scale: targetScaleFactor, // Scale up
                     alpha: 1,         // Fade in
                     duration: popDuration,
                     ease: 'Quad.easeOut',
                     onComplete: () => {
                         console.log(`[PlayOrderUIAnimation] Sprite ${index} pop complete. Returning...`);
                         // Second Tween (Chained): Move back to UI and fade out
                         this.tweens.add({
                             targets: sprite,
                             x: sprite.getData('targetX'), // Return to original UI X
                             y: sprite.getData('targetY'), // Return to original UI Y
                             scale: 0, // Scale down
                             alpha: 0, // Fade out
                             duration: returnDuration,
                             ease: 'Power2',
                             onComplete: (tween, targets) => {
                                console.log(`[PlayOrderUIAnimation] Sprite ${index} return complete. Destroying.`);
                                targets.forEach(target => target.destroy());
                             }
                         });
                     }
                 });

            }, [], this); // End of delayedCall
        });

        // REMOVED old triggerFadeOut function
    }

    // Modified clearAndRefill - simplified back
    clearAndRefill(removedItemsData, locations, bonusData = null) { // Expects data without sprite refs now
        // --- LOGGING ---
        console.log(`[ClearAndRefill] Start. Bonus: ${!!bonusData}. Items to clear from grid data: ${removedItemsData.length}`);
        // --- END LOGGING ---

        removedItemsData.forEach(itemData => {
             // Clear grid data
             // Need coords from itemData passed in
             const y = itemData.y;
             const x = itemData.x;
             if (this.grid[y] && this.grid[y][x]) { // Check if grid slot exists
                  // We might not need to check item equality if visuals are gone
                  this.grid[y][x] = null;
             } else if (this.grid[y]) {
                 this.grid[y][x] = null; // Ensure null even if it wasn't the expected item
             }
             // Visuals assumed destroyed by caller (shrinkAndClear or bonus path pre-destroy)
        });

        // --- LOGGING ---
        console.log("[ClearAndRefill] Grid data cleared. Calling generateReplacements.");
        // --- END LOGGING ---
        this.generateReplacements(locations, bonusData);
    }

    // generateReplacements - Simplified Bonus Handling
    generateReplacements(locations, bonusData = null) {
        console.log(`[GenerateReplacements] Start. Locations: ${locations.length}. Bonus items requested: ${bonusData ? bonusData.length : 0}.`);
        let newlyGeneratedItems = [];
        const newSprites = [];
        const newBackgrounds = [];
        const availableLocations = [...locations]; // Copy locations to modify

        // 1. Generate Specific Bonus Items if space allows
        if (bonusData) {
            console.log(`[GenerateReplacements] Processing ${bonusData.length} bonus items.`);
            bonusData.forEach(bonusItem => {
                if (availableLocations.length > 0) {
                    // Place bonus item in an available location from the match
                    const loc = availableLocations.shift(); // Take the next available location
                    const { spriteIndex, color } = bonusItem;
                    const newItemData = { spriteIndex, color, x: loc.x, y: loc.y, sprite: null };
                    this.grid[loc.y][loc.x] = newItemData;
                    const visuals = this._createGridItemVisuals(newItemData, loc.x, loc.y);
                    if (visuals.sprite) newSprites.push(visuals.sprite);
                    if (visuals.background) newBackgrounds.push(visuals.background);
                    newlyGeneratedItems.push(newItemData);
                    console.log(`[GenerateReplacements] Placed bonus item (${SPRITE_NAMES[spriteIndex]}) at (${loc.x}, ${loc.y}).`);
                } else {
                    // No locations left from match, DISCARD the bonus item
                    console.log(`[GenerateReplacements] No immediate space for bonus item (${SPRITE_NAMES[bonusItem.spriteIndex]}). Discarding.`);
                    // Do nothing, item is discarded
                }
            });
        }

        // 2. Generate Random Replacements for Remaining Empty Locations
        console.log(`[GenerateReplacements] Generating random replacements for remaining ${availableLocations.length} locations.`);
        availableLocations.forEach(loc => {
            const { x, y } = loc;
            // Ensure the spot wasn't filled by a bonus item in the same cycle (shouldn't happen with shift)
            if (this.grid[y]?.[x] !== null) {
                console.warn(`[GenerateReplacements] Location (${x},${y}) already filled? Skipping random.`);
                return;
            }

            let newItemData;
            let attempts = 0;
            const maxAttempts = 20; // Safety break
            let isSafeToPlace = false;

            // Keep generating until a non-matching item is found
            do {
                newItemData = this._generateRandomItemData(x, y);
                attempts++;

                // --- Robust Check: Temporarily place and run full findMatches --- 
                const originalGridValue = this.grid[y][x]; // Store original (should be null)
                this.grid[y][x] = newItemData; // Temporarily place

                const matchesFound = this.findMatches(); // Check whole board
                isSafeToPlace = true; // Assume safe initially

                // Check if the temporarily placed item is part of any match
                for (const match of matchesFound) {
                    if (match.x === x && match.y === y) {
                        isSafeToPlace = false; // Found a match involving this item
                        break;
                    }
                }

                // If not safe, revert the grid change
                if (!isSafeToPlace) {
                    this.grid[y][x] = originalGridValue;
                    // console.log(`  - Item at (${x},${y}) caused match. Regenerating...`);
                }
                // --- End Robust Check ---

                if (attempts > maxAttempts) {
                    console.error(`[GenerateReplacements] Max attempts (${maxAttempts}) reached for (${x},${y}). Reverting and skipping slot.`);
                    this.grid[y][x] = originalGridValue; // Ensure grid is reverted
                    newItemData = null; // Mark as failed
                    break; // Avoid infinite loop
                }
            } while (!isSafeToPlace);

            // Only proceed if an item was successfully found and placed
            if (newItemData) {
                console.log(`[GenerateReplacements] Placing verified (robust check) non-matching item at (${x},${y}): Color ${newItemData.color.toString(16)}`);
                // newItemData is already on the grid from the temporary check
                const visuals = this._createGridItemVisuals(newItemData, x, y);
                if (visuals.sprite) newSprites.push(visuals.sprite);
                if (visuals.background) newBackgrounds.push(visuals.background);
                newlyGeneratedItems.push(newItemData);
            } else {
                 console.warn(`[GenerateReplacements] Failed to find safe item for (${x},${y}) after ${maxAttempts} attempts.`);
            }
        });

        // 3. Start Simultaneous Appear Tweens for newly created items
        if (newSprites.length > 0 || newBackgrounds.length > 0) {
            console.log(`[GenerateReplacements] Starting appear tweens for ${newSprites.length} sprites and ${newBackgrounds.length} backgrounds.`);
            if (newBackgrounds.length > 0) {
                 this.tweens.add({ targets: newBackgrounds, scaleX: 1, scaleY: 1, alpha: 1, duration: APPEAR_DURATION, ease: 'Power2' });
            }
             if (newSprites.length > 0) {
                this.tweens.add({ targets: newSprites,
                    displayWidth: SPRITE_SIZE, displayHeight: SPRITE_SIZE, alpha: 1,
                    duration: APPEAR_DURATION, ease: 'Power2' });
             }
        } else {
            console.log("[GenerateReplacements] No new sprites/backgrounds to animate this cycle.");
        }

        // Add a small delay before checking for auto-matches to make regeneration less jarring
        // REMOVED Delay - preventAutoMatches should find nothing now from newly generated items
        console.log("[GenerateReplacements] Calling preventAutoMatches immediately.");
        this.preventAutoMatches(newlyGeneratedItems);
    }

    // preventAutoMatches - Simplified (No Queue Check)
    preventAutoMatches(newlyGeneratedItems, enableSwapOnFinish = true) {
        // --- DEBUG LOG --- 
        const callId = Phaser.Math.RND.uuid(); // Unique ID for this call chain
        console.log(`[PreventAutoMatches ${callId}] Start Check. Newly generated: ${newlyGeneratedItems.length}`);
        // --- END DEBUG LOG ---
        let loops = 0; const maxLoops = GRID_WIDTH * GRID_HEIGHT;
        let regeneratedCount = 0;

        while (loops < maxLoops) {
            loops++;
            const autoMatches = this.findMatches();
            if (autoMatches.length === 0) {
                console.log(`[PreventAutoMatches ${callId}] Loop ${loops}: No auto-matches found.`);
                break;
            }

            const itemsToRegenerate = [...new Set(autoMatches)];
            // --- DEBUG LOG --- 
            console.log(`[PreventAutoMatches ${callId}] Loop ${loops}: Found ${autoMatches.length} matches involving ${itemsToRegenerate.length} unique items. Regenerating...`);
            itemsToRegenerate.forEach(item => console.log(`  - Item to Regen: (${item.x},${item.y}), Color: ${item.color.toString(16)}, Sprite: ${SPRITE_NAMES[item.spriteIndex]}`));
            // --- END DEBUG LOG ---
            if (itemsToRegenerate.length === 0) {
                 console.warn(`[PreventAutoMatches ${callId}] Loop ${loops}: autoMatches > 0 but no unique items? Breaking.`); 
                 break; 
            }
            itemsToRegenerate.forEach(itemData => {
                 this.regenerateItemColor(itemData, callId); 
                 regeneratedCount++;
            });
        }
        if (loops >= maxLoops) { console.error("[PreventAutoMatches] Max loops reached in preventAutoMatches."); }

        // If items were regenerated, the board changed, delay next steps
        if (regeneratedCount > 0) {
            console.log("[PreventAutoMatches] Items regenerated, delaying further checks.");
             this.time.delayedCall(APPEAR_DURATION + 50, () => this.preventAutoMatches([], enableSwapOnFinish), [], this);
             return; // Exit and re-check stability later
        }
        
        // --- REMOVED Queue Processing Logic --- 

        // Board is stable, now check hints and enable swap
        console.log("[PreventAutoMatches] Board stable.");
        this.time.delayedCall(50, this.checkForHints, [], this); // Check hints shortly after stability
        
        if (enableSwapOnFinish && !this.isGameWon) {
             this.canSwap = true; 
             console.log("[PreventAutoMatches] Swapping enabled.");
        }
    }

    // --- Hint System --- 

    gridContainsItem(spriteIndex, color) {
        for (let y = 0; y < GRID_HEIGHT; y++) {
            for (let x = 0; x < GRID_WIDTH; x++) {
                const item = this.grid[y]?.[x];
                if (item && item.spriteIndex === spriteIndex && item.color === color) {
                    return true; // Found one
                }
            }
        }
        return false; // Not found
    }

    stopAllHints() {
        // Stop item hints
        this.hintedItems.forEach(itemData => {
            if (itemData.sprite && itemData.sprite.scene) {
                 this.tweens.killTweensOf(itemData.sprite);
                 try {
                     itemData.sprite.setAlpha(1);
                     // Reset display size instead of scale
                     itemData.sprite.setDisplaySize(SPRITE_SIZE, SPRITE_SIZE);
                 } catch (e) { /* ignore */ }
            }
        });
        this.hintedItems.clear();

        // Stop order display hints
        this.hintedOrderSprites.forEach(sprite => {
            if (sprite && sprite.scene) { 
                this.tweens.killTweensOf(sprite);
                try {
                    sprite.setAlpha(1);
                    // Reset display size instead of scale
                    const originalUiSize = TILE_SIZE * 0.4;
                    sprite.setDisplaySize(originalUiSize, originalUiSize);
                 } catch (e) { /* ignore */ }
            }
        });
        this.hintedOrderSprites.clear(); 

        // Remove the hint cycling timer
        if (this.hintTimer) {
            this.hintTimer.remove();
            this.hintTimer = null;
        }
        this.availableHintColors = []; 
        this.currentHintColorIndex = 0;
    }

    checkForHints() {
        // Add checks for game state
        if (this.isGameWon) return;
        
        this.stopAllHints(); // Clear previous hints and timer first

        const potentialHintsByColor = new Map(); // Map<color, Set<itemData>>

        // 1. Check each eligible order and color combination (using activeOrders)
        this.activeOrders.forEach(order => { // Check active orders
            // Only hint for non-completed orders that require 3+ items
            if (!order.completed && order.requiredIndices.length >= 3) {
                for (const color of COLORS) {
                    const allPresentWithThisColor = order.requiredIndices.every(reqIdx => 
                        this.gridContainsItem(reqIdx, color)
                    );

                    if (allPresentWithThisColor) {
                        // If condition met, find *all* grid items matching index AND color
                        order.requiredIndices.forEach(reqIdx => {
                            for (let y = 0; y < GRID_HEIGHT; y++) {
                                for (let x = 0; x < GRID_WIDTH; x++) {
                                    const itemData = this.grid[y]?.[x];
                                    if (itemData && itemData.spriteIndex === reqIdx && itemData.color === color) {
                                        if (!potentialHintsByColor.has(color)) {
                                            potentialHintsByColor.set(color, new Set());
                                        }
                                        potentialHintsByColor.get(color).add(itemData);
                                    }
                                }
                            }
                        });
                        // Also store which order this hint applies to (needed for UI hint)
                        potentialHintsByColor.get(color).orderId = order.id;
                    }
                } // End color loop
            }
        }); // End order loop

        // 2. Store the colors that actually have hints
        this.availableHintColors = Array.from(potentialHintsByColor.keys());
        this.potentialHintsByColor = potentialHintsByColor; // Store the map for use in display

        // 3. If hints are available, start the timed cycle
        if (this.availableHintColors.length > 0) {
            console.log(`Hints available for colors: ${this.availableHintColors.map(c => c.toString(16)).join(', ')}`);
            this.currentHintColorIndex = 0; // Start from the first color

            // Create the 5-second repeating timer
            this.hintTimer = this.time.addEvent({
                delay: 5000, // 5 seconds
                callback: this.displayNextHintColor,
                callbackScope: this,
                loop: true
            });

            // Display the first hint immediately
            this.displayNextHintColor(); 
        } else {
            console.log("No hints available.");
        }
    }

    displayNextHintColor() {
        // Add checks for game state
        if (this.isGameWon || !this.availableHintColors || this.availableHintColors.length === 0) {
            this.stopAllHints(); 
            return;
        }

        // Reset alpha of previously hinted ITEMS
        this.hintedItems.forEach(itemData => {
            if (itemData.sprite && itemData.sprite.scene) { // Added scene check
                 try { itemData.sprite.setAlpha(1); } catch(e) { /* ignore */ }
            }
        });
        this.hintedItems.clear(); 

        // Reset alpha of previously hinted order SPRITES
        this.hintedOrderSprites.forEach(sprite => {
             if (sprite && sprite.scene) { 
                 try { sprite.setAlpha(1); } catch (e) { /* ignore */ }
             }
        });
        this.hintedOrderSprites.clear();

        // Determine the color for this cycle
        const hintColorToShow = this.availableHintColors[this.currentHintColorIndex];
        const hintedItemDataSet = this.potentialHintsByColor.get(hintColorToShow);
        const hintedOrderId = hintedItemDataSet ? hintedItemDataSet.orderId : -1;

        if (!hintedItemDataSet) {
             console.warn("Hint color available but no data found?");
             this.currentHintColorIndex = (this.currentHintColorIndex + 1) % this.availableHintColors.length;
             this.time.delayedCall(100, this.displayNextHintColor, [], this); // Try next hint quickly
             return;
        }

        // Find the specific order UI elements matching the hinted order ID
        const targetOrder = this.activeOrders.find(o => o.id === hintedOrderId);

        // Start the single pulse animation for grid ITEMS
        hintedItemDataSet.forEach(itemData => {
            if (itemData.sprite && itemData.sprite.scene) { 
                this.hintedItems.add(itemData); // Track for potential cleanup
                const originalWidth = SPRITE_SIZE;
                const originalHeight = SPRITE_SIZE;
                const targetWidth = originalWidth * 1.15;
                const targetHeight = originalHeight * 1.15;
                this.tweens.add({
                    targets: itemData.sprite,
                    displayWidth: targetWidth,
                    displayHeight: targetHeight,
                    duration: 250,
                    ease: 'Quad.easeOut', // Ease out for the pulse
                    // REMOVED yoyo: true
                    onComplete: (tween, targets) => {
                        // Explicitly tween back to original size
                        this.tweens.add({ 
                            targets: targets,
                            displayWidth: originalWidth,
                            displayHeight: originalHeight,
                            duration: 150, // Faster return
                            ease: 'Quad.easeIn'
                        });
                    }
                });
            }
        });

        // Start the single pulse animation for ORDER SPRITES (if the order still exists)
        if (targetOrder && targetOrder.displaySprites) {
            targetOrder.displaySprites.forEach(sprite => {
                if (sprite && sprite.scene) { // Check sprite exists and is in scene
                    this.hintedOrderSprites.add(sprite); // Track the SPRITE for next cleanup
                    const originalUiWidth = TILE_SIZE * 0.4;
                    const originalUiHeight = TILE_SIZE * 0.4;
                    const targetWidth = originalUiWidth * 1.15;
                    const targetHeight = originalUiHeight * 1.15;
                    this.tweens.add({
                        targets: sprite, // Target the SPRITE
                        displayWidth: targetWidth,
                        displayHeight: targetHeight,
                        duration: 250,
                        ease: 'Quad.easeOut', // Ease out for the pulse
                         // REMOVED yoyo: true
                         onComplete: (tween, targets) => {
                            // Explicitly tween back to original size
                            this.tweens.add({ 
                                targets: targets,
                                displayWidth: originalUiWidth,
                                displayHeight: originalUiHeight,
                                duration: 150, // Faster return
                                ease: 'Quad.easeIn'
                            });
                        }
                    });
                }
            });
        }

        // Move to the next color index
        this.currentHintColorIndex = (this.currentHintColorIndex + 1) % this.availableHintColors.length;
    }

    // --- Order System Methods (Simplified) ---
    // --- Renamed from triggerWin to triggerWinCondition ---
    triggerWinCondition() {
        if (this.isGameWon) return; // Prevent double trigger
        console.log("YOU WIN!");
        this.isGameWon = true;
        this.canSwap = false; // Disable further swaps
        this.stopOrderGenerationTimer(); // Stop new orders
        this.stopAllHints(); // Stop hints
        this.winScreenGroup.setVisible(true);

        // Listen for a single click/tap anywhere to dismiss
        this.input.once('pointerdown', this.restartGame, this); // Go to restart directly
    }

    // --- UPDATED Game Reset Function ---
    restartGame() {
        console.log("--- RESTARTING GAME ---");

        // Stop everything
        this.stopOrderGenerationTimer();
        this.stopAllHints();
        // Stop player direction timer
        if (this.playerDirectionTimer) {
            this.playerDirectionTimer.remove();
            this.playerDirectionTimer = null;
        }
        // Stop player movement tween if active
        if (this.playerSprite) {
            this.tweens.killTweensOf(this.playerSprite);
        }
        this.tweens.killAll(); // Stop all active tweens forcefully (redundant but safe)
        this.time.removeAllEvents(); // Remove all timed events

        // Reset state variables
        this.isGameWon = false;
        this.completedOrders = 0;
        this.nextOrderId = 0;
        this.activeOrders = [];

        // Hide overlays
        if (this.winScreenGroup) this.winScreenGroup.setVisible(false);

        // Reset orders visually and data-wise
        this.completedOrdersText.setText(`Completed: ${this.completedOrders}/${this.totalOrdersToWin}`);
        this.orderDisplayGroup.clear(true, true); // Clear UI display

        // Clear existing grid visuals and data
        if (this.items) {
            this.items.getChildren().forEach(itemSprite => {
                if (itemSprite && itemSprite.getData) {
                    const background = itemSprite.getData('background');
                    if (background && background.destroy) {
                        try { background.destroy(); } catch (e) {}
                    }
                }
            });
            this.items.clear(true, true);
        }
        this.grid = [];

        // Re-initialize grid
        this.refillItemGenerationBag();
        this.createGridData();
        this.drawGrid();
        this.setupInput();

        // Generate initial order and start timer
        this.generateInitialOrder();
        this._drawOrderUI();
        this.startOrderGenerationTimer();

        // Enable swapping
        this.canSwap = true;
        this.time.delayedCall(100, this.checkForHints, [], this);
        console.log("--- GAME RESTARTED --- ");
    }

    // --- Helper Functions --- 

    getWorldCoordinatesFromGrid(gridX, gridY) {
        const gridOffsetY = UI_AREA_HEIGHT;
        const gridXPadding = (this.game.config.width - (GRID_WIDTH * TILE_SIZE)) / 2;
        const worldX = gridX * TILE_SIZE + TILE_SIZE / 2 + gridXPadding;
        const worldY = gridY * TILE_SIZE + TILE_SIZE / 2 + gridOffsetY;
        return { x: worldX, y: worldY };
    }

    // Helper to create background, sprite, and set data
    _createGridItemVisuals(itemData, gridX, gridY) {
        const worldPos = this.getWorldCoordinatesFromGrid(gridX, gridY);
        const tileCenterX = worldPos.x;
        const tileCenterY = worldPos.y;

        // Create Background Graphics (Use Constants) - Keep this section
        const graphicsX = tileCenterX - BG_SIZE / 2;
        const graphicsY = tileCenterY - BG_SIZE / 2;
        const backgroundGraphics = this.add.graphics({ x: graphicsX, y: graphicsY });
        backgroundGraphics.fillStyle(itemData.color, 1);
        backgroundGraphics.fillRoundedRect(0, 0, BG_SIZE, BG_SIZE, CORNER_RADIUS);
        backgroundGraphics.setDepth(0); // Background behind sprite
        // Set initial state for appear animation (will be triggered later)
        backgroundGraphics.setScale(0);
        backgroundGraphics.setAlpha(0);

        // Create Sprite (Use Constants)
        // Use this.add.image for consistency with other parts maybe? Or stick to group.create
        // Using group.create as it was before
        const itemSprite = this.items.create(tileCenterX, tileCenterY, 'item_' + itemData.spriteIndex)
            .setInteractive()
            .setDepth(1); // Sprite in front of background
        // REMOVE itemSprite.clearTint(); // Ensure no tinting is applied here

        // SET Display Size directly using SPRITE_SIZE constant
        itemSprite.setDisplaySize(SPRITE_SIZE, SPRITE_SIZE);

        // Set initial state for appear animation (will be triggered later)
        // REMOVED itemSprite.setScale(0);
        // Set initial display size to 0 for tween start
        itemSprite.setDisplaySize(0, 0);
        itemSprite.setAlpha(0);

        // Store references
        itemData.sprite = itemSprite;
        itemSprite.setData('gridData', itemData);
        itemSprite.setData('background', backgroundGraphics); // Store background reference

        // Return the created visuals
        return { sprite: itemSprite, background: backgroundGraphics }; // Return object
    }

    // Helper to set position of sprite and its background
    _setGridItemVisualPosition(itemSprite, worldX, worldY) {
        if (!itemSprite || !itemSprite.scene) return; // Add scene check

        itemSprite.setPosition(worldX, worldY);

        // Restore background positioning logic
        const background = itemSprite.getData('background');
        // Check if background exists and is a Graphics object and belongs to the scene
        if (background && background instanceof Phaser.GameObjects.Graphics && background.scene) {
            const graphicsX = worldX - BG_SIZE / 2; // Use Constant
            const graphicsY = worldY - BG_SIZE / 2; // Use Constant
            background.setPosition(graphicsX, graphicsY);
        }
    }

    regenerateItemColor(itemData, preventAutoMatchesCallId) {
        const { x, y } = itemData;
        const originalColor = itemData.color;
        // --- DEBUG LOG ---
        console.log(`  [RegenColor ${preventAutoMatchesCallId}] Attempting Regen for (${x},${y}), Original Color: ${originalColor.toString(16)}`);
        // --- END DEBUG LOG ---
        let loops = 0;

        while (loops < COLORS.length + 1) {
            // --- DEBUG LOG ---
            const attemptId = loops + 1;
            // --- END DEBUG LOG ---
             loops++;
             let newColor = Phaser.Utils.Array.GetRandom(COLORS);
            // --- DEBUG LOG ---
            console.log(`    [RegenColor ${preventAutoMatchesCallId}] Attempt ${attemptId}: Trying Color ${newColor.toString(16)}`);
            // --- END DEBUG LOG ---
             if (newColor !== originalColor && !this.checkMatchAt(x, y, newColor)) {
                 // Found a safe color
                 itemData.color = newColor;
                 // --- DEBUG LOG ---
                 console.log(`    [RegenColor ${preventAutoMatchesCallId}] Attempt ${attemptId}: SUCCESS! New Color: ${newColor.toString(16)}`);
                 // --- END DEBUG LOG ---
                 // Restore background update logic
                 const background = itemData.sprite?.getData('background'); // Use optional chaining
                 // Check if background exists, is Graphics, and part of scene
                 if (background && background instanceof Phaser.GameObjects.Graphics && background.scene) {
                     try {
                         background.clear(); // Clear previous drawing
                         background.fillStyle(newColor, 1); // Set new fill style
                         // Redraw the shape using the constants
                         background.fillRoundedRect(0, 0, BG_SIZE, BG_SIZE, CORNER_RADIUS);
                     } catch (e) {
                         console.warn(`Error updating background color for (${x},${y}):`, e);
                     }
                 } else if (itemData.sprite) { // Only warn if sprite exists but background doesn't
                     console.warn(`RegenerateColor: Could not find background for item at (${x},${y}) to update color.`);
                 }
                 return; // Exit function
             }
        }
        console.warn(`Could not find a non-matching color for item at (${x}, ${y}) after ${loops} attempts.`);
    }

    // --- New Order System Methods ---

    getCurrentLevel() {
        let level = 1;
        for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
            if (this.completedOrders >= LEVEL_THRESHOLDS[i]) {
                level = i + 2; // Thresholds index 0 corresponds to level 2
            } else {
                break; // Stop checking once a threshold isn't met
            }
        }
        return level;
    }

    getMaxOrderLengthForLevel(level) {
        // Level 1: max 2 items, Level 2: max 3 items, etc.
        return Math.min(level + 1, MAX_ORDER_LENGTH);
    }

    generateRandomOrder(length) {
        console.log(`[OrderGen] Generating order of length ${length}`);
        if (length <= 0 || length > this.itemPoolIndices.length) {
            console.error(`[OrderGen] Invalid order length requested: ${length}`);
            length = 1; // Default to 1 if invalid
        }

        // Shuffle the available item indices
        const shuffledIndices = Phaser.Utils.Array.Shuffle([...this.itemPoolIndices]);

        // Take the first 'length' items
        const requiredIndices = shuffledIndices.slice(0, length);

        const newOrder = {
            id: this.nextOrderId++,
            requiredIndices: requiredIndices,
            requiredNames: requiredIndices.map(index => SPRITE_NAMES[index] || `Item ${index + 1}`),
            completed: false,
            displayLabel: null,
            displaySprites: []
        };

        console.log(`[OrderGen] Generated Order ID ${newOrder.id}: Items [${newOrder.requiredIndices.join(', ')}]`);
        return newOrder;
    }

    generateInitialOrder() {
        console.log("[OrderGen] Generating initial order...");
        const initialOrder = this.generateRandomOrder(INITIAL_ORDER_LENGTH);
        this.activeOrders.push(initialOrder);
    }

    generateNewOrderScheduled() {
        console.log("[OrderGen Timer] Attempting to generate new order...");
        if (this.isGameWon) {
            console.log("[OrderGen Timer] Game finished, stopping generation.");
            return; // Don't generate if game is over or won
        }

        if (this.activeOrders.length >= MAX_ACTIVE_ORDERS) {
            console.log(`[OrderGen Timer] Max orders (${MAX_ACTIVE_ORDERS}) reached. Waiting for an order to be completed.`);
            // No longer triggers game over, just returns and waits.
            return;
        }

        const currentLevel = this.getCurrentLevel();
        const maxLen = this.getMaxOrderLengthForLevel(currentLevel);
        const randomLength = Phaser.Math.Between(1, maxLen);
        console.log(`[OrderGen Timer] Current Level: ${currentLevel}, Max Length: ${maxLen}, Chosen Length: ${randomLength}`);

        const newOrder = this.generateRandomOrder(randomLength);
        this.activeOrders.push(newOrder);
        this._drawOrderUI(); // Update display immediately
    }

    startOrderGenerationTimer() {
        console.log(`[OrderGen] Starting order generation timer (${ORDER_GENERATION_INTERVAL}ms interval).`);
        // Ensure previous timer is stopped if restart happens
        if (this.orderGenerationTimer) {
            this.orderGenerationTimer.remove();
        }
        this.orderGenerationTimer = this.time.addEvent({
            delay: ORDER_GENERATION_INTERVAL,
            callback: this.generateNewOrderScheduled,
            callbackScope: this,
            loop: true
        });
    }

    stopOrderGenerationTimer() {
        if (this.orderGenerationTimer) {
            console.log("[OrderGen] Stopping order generation timer.");
            this.orderGenerationTimer.remove();
            this.orderGenerationTimer = null;
        }
    }

    _drawOrderUI() {
        console.log("[UI Draw] Drawing orders:", this.activeOrders.length);
        this.orderDisplayGroup.clear(true, true); // Clear previous UI elements

        const uiXPadding = 10;
        const uiYPadding = 10;
        // Start drawing below the completed counter
        let currentY = uiYPadding + 20; // Add some space below counter
        const orderLabelSpacing = 60; // Space for "Order X: " text
        const orderSpriteSize = TILE_SIZE * 0.4; // Smaller sprites for UI
        const orderSpritePadding = 4;
        const orderLineHeight = Math.max(16, orderSpriteSize + 4); // Height for each order line

        this.activeOrders.forEach((order, index) => {
            // Limit drawing to MAX_ACTIVE_ORDERS visually, though array might temporarily hold more before game over
            if (index >= MAX_ACTIVE_ORDERS) return;

            // Create Label Text (Use internal order ID for consistency)
            const labelText = `Order #${order.id}:`;
            const label = this.add.text(uiXPadding, currentY + orderLineHeight / 2, labelText,
                { fontSize: '12px', fill: '#fff' }
            ).setOrigin(0, 0.5).setDepth(this.uiDepth);
            order.displayLabel = label; // Store reference
            this.orderDisplayGroup.add(label);

            // Create Sprites for Required Items
            order.displaySprites = []; // Clear old sprite references
            let spriteX = uiXPadding + orderLabelSpacing;
            order.requiredIndices.forEach(itemIndex => {
                const sprite = this.add.sprite(spriteX, currentY + orderLineHeight / 2, 'item_' + itemIndex)
                    .setDisplaySize(orderSpriteSize, orderSpriteSize)
                    .setOrigin(0, 0.5)
                    .setDepth(this.uiDepth);

                order.displaySprites.push(sprite); // Store reference
                this.orderDisplayGroup.add(sprite);
                spriteX += orderSpriteSize + orderSpritePadding;
            });

            // Apply visual style for completed orders (if needed immediately)
            if (order.completed) {
                label.setAlpha(0.6);
                order.displaySprites.forEach(sprite => {
                    sprite.setTint(0x88ff88);
                    sprite.setAlpha(0.6);
                });
            }

            currentY += orderLineHeight; // Move to next line
        });
    }

    // --- End New Order System Methods ---

    // --- NEW: Function to change player sprite animation ---
    // RENAMED from changePlayerDirection to updatePlayerState
    updatePlayerState() {
        // Don't pick a new target if already moving or game ended
        if (this.playerMovement.isMoving || !this.playerSprite || !this.playerSprite.scene || this.isGameWon) {
            return;
        }

        // Pick a new random target position
        const targetX = Phaser.Math.FloatBetween(this.playerMovement.minX, this.playerMovement.maxX);
        const targetY = Phaser.Math.FloatBetween(this.playerMovement.minY, this.playerMovement.maxY);

        const currentX = this.playerSprite.x;
        const currentY = this.playerSprite.y;

        // Calculate angle and distance
        const angle = Phaser.Math.Angle.Between(currentX, currentY, targetX, targetY);
        const distance = Phaser.Math.Distance.Between(currentX, currentY, targetX, targetY);

        // Determine direction based on angle (refined 8-way)
        const angleDeg = Phaser.Math.RadToDeg(angle);
        let direction = 'facing'; // Default
        let idleDirection = 'facing'; // Track idle direction separately

        // Map angle to animation keys (adjust based on your spritesheet layout)
        if (angleDeg >= -22.5 && angleDeg < 22.5)         { direction = 'right'; }
        else if (angleDeg >= 22.5 && angleDeg < 67.5)    { direction = 'diag_right'; } // Down-Right
        else if (angleDeg >= 67.5 && angleDeg < 112.5)   { direction = 'facing'; }     // Down
        else if (angleDeg >= 112.5 && angleDeg < 157.5)  { direction = 'diag_left'; }  // Down-Left
        else if (angleDeg >= 157.5 || angleDeg < -157.5) { direction = 'left'; }
        else if (angleDeg >= -157.5 && angleDeg < -112.5) { direction = 'away_left'; }  // Up-Left
        else if (angleDeg >= -112.5 && angleDeg < -67.5)  { direction = 'away'; }       // Up
        else if (angleDeg >= -67.5 && angleDeg < -22.5)   { direction = 'away_right'; } // Up-Right

        idleDirection = direction; // Idle uses the same direction key

        const walkAnimationKey = `player_walk_${direction}`;
        const idleAnimationKey = `player_idle_${idleDirection}`;

        console.log(`[Player Update] Moving to (${targetX.toFixed(0)}, ${targetY.toFixed(0)}). Direction: ${direction}. Walk Anim: ${walkAnimationKey}`);
        this.playerSprite.play(walkAnimationKey, true); // Play the WALK animation

        // Calculate tween duration based on distance and speed
        const duration = (distance / this.playerMovement.speed) * 1000; // in milliseconds

        // Start the movement tween
        this.playerMovement.isMoving = true;
        this.tweens.add({
            targets: this.playerSprite,
            x: targetX,
            y: targetY,
            duration: duration,
            ease: 'Linear', // Constant speed
            onComplete: () => {
                console.log(`[Player Update] Reached target. Switching to idle: ${idleAnimationKey}`);
                this.playerMovement.isMoving = false;
                // Switch to the corresponding IDLE animation on arrival
                this.playerSprite.play(idleAnimationKey, true);
            }
        });
    }
    // --- END NEW Function ---

    // --- Helper to generate raw random item data ---
    _generateRandomItemData(x, y) {
        let spriteIndex;
        if (this.itemGenerationBag.length === 0) { this.refillItemGenerationBag(); }
        spriteIndex = this.itemGenerationBag.pop();
        const color = Phaser.Utils.Array.GetRandom(COLORS);
        return { spriteIndex: spriteIndex, color: color, sprite: null, x: x, y: y };
    }
    // --- End Helper ---

}

// Define config and initialize the game when the window loads
window.onload = () => {
    // REMOVED constant checking logs

    // Define config INSIDE onload (can be moved back out later if preferred)
    const config = {
        type: Phaser.AUTO,
        width: GRID_WIDTH * TILE_SIZE + 20, 
        height: GRID_HEIGHT * TILE_SIZE + UI_AREA_HEIGHT, 
        parent: 'phaser-game',
        backgroundColor: '#2d2d2d',
        scene: [BootScene, GameScene] 
    };

    console.log("Window loaded, creating Phaser game with config:", config);
    game = new Phaser.Game(config);
}; 