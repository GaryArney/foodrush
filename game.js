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

const SPRITE_NAMES = [
    "Apple", "Avocado", "Bacon", "Banana", "Basil",          // 0-4
    "Beer", "Beet", "Bell Pepper", "Blueberry", "Acorn"     // 5-9
]; 

const STATIC_ORDERS_DEF = [
    { id: 0, requiredIndices: [0] },                 // Order 1: Apple
    { id: 1, requiredIndices: [1, 2] },              // Order 2: Avocado, Bacon
    { id: 2, requiredIndices: [3, 4, 5] },           // Order 3: Banana, Basil, Beer
    { id: 3, requiredIndices: [6, 7, 8, 9] },        // Order 4: Beet, Bell Pepper, Blueberry, Acorn
    { id: 4, requiredIndices: [0, 2, 4, 6, 8] }      // Order 5: Apple, Bacon, Basil, Beet, Blueberry
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

        // Order System Properties
        this.gameOrders = [];
        this.totalOrdersToWin = 5;
        this.isGameWon = false;
        this.winScreenGroup = null;
        this.completedOrders = 0;

        // Hint System
        this.hintedItems = new Set();
        this.availableHintColors = [];
        this.currentHintColorIndex = 0;
        this.hintTimer = null;
        this.hintedOrderSprites = new Set();

        // Configurable Order Parameters (Remove unused)
        this.minOrderItems = 1;
        this.maxOrderItems = 3;
    }

    preload() {
        // Assets should be loaded in BootScene
    }

    create() {
        console.log("GameScene: Creating...");

        // Explicitly clear any previous display group content FIRST
        if (this.orderDisplayGroup) {
            this.orderDisplayGroup.clear(true, true); // Destroy children
            console.log("Cleared previous order display group.");
        }
        // Now create fresh groups
        this.items = this.add.group();
        this.orderDisplayGroup = this.add.group();
        this.refillItemGenerationBag();

        // Play background music
        this.sound.play('bgm', { 
            loop: true, 
            volume: 0.3 // Adjust volume (0 to 1)
        });

        // --- UI Setup (Top Area) ---
        const uiXPadding = 10;
        const uiYPadding = 10;
        let currentY = uiYPadding;
        const orderLabelSpacing = 60; // Space for "Order X: " text
        const orderSpriteSize = TILE_SIZE * 0.4; // Smaller sprites for UI
        const orderSpritePadding = 4;
        const orderLineHeight = Math.max(16, orderSpriteSize + 4); // Height for each order line
        const uiDepth = 5; // Depth for UI elements

        // Initialize static orders & create displays in UI area
        this.gameOrders = STATIC_ORDERS_DEF.map(def => ({
            ...def,
            requiredNames: def.requiredIndices.map(index => SPRITE_NAMES[index] || `Item ${index + 1}`),
            completed: false,
            displayLabel: null, // Text object for "Order X:"
            displaySprites: [] // Array of sprite objects for required items
        }));
        
        // Loop creating order UI
        this.gameOrders.forEach((order, index) => {
            // Create the "Order X: " Label Text
            const labelText = `Order ${order.id + 1}:`;
            const label = this.add.text(uiXPadding, currentY + orderLineHeight / 2, labelText, 
                { fontSize: '12px', fill: '#fff' }
            ).setOrigin(0, 0.5).setDepth(uiDepth); // Set depth
            order.displayLabel = label;
            this.orderDisplayGroup.add(label);

            // Create Sprites for Required Items
            let spriteX = uiXPadding + orderLabelSpacing;
            order.requiredIndices.forEach(itemIndex => {
                const sprite = this.add.sprite(spriteX, currentY + orderLineHeight / 2, 'item_' + itemIndex)
                    .setDisplaySize(orderSpriteSize, orderSpriteSize)
                    .setOrigin(0, 0.5)
                    .setDepth(uiDepth); // Set depth
                
                order.displaySprites.push(sprite);
                this.orderDisplayGroup.add(sprite);
                spriteX += orderSpriteSize + orderSpritePadding; // Move to next sprite position
            });

            currentY += orderLineHeight; // Move to next line
        });

        // Completed Counter (Top Right)
        this.completedOrdersText = this.add.text(
            this.game.config.width - uiXPadding,
            uiYPadding,
            `Completed: ${this.completedOrders}/${this.totalOrdersToWin}`,
            { fontSize: '14px', fill: '#0f0', align: 'right' }
        ).setOrigin(1, 0).setDepth(uiDepth); // Set depth for counter

        // --- Grid Setup (Below UI) ---
        this.createGridData();
        this.drawGrid(); // Uses UI_AREA_HEIGHT offset now
        this.setupInput();

        // --- Win Screen Setup (Centered, Initially Hidden) ---
        this.winScreenGroup = this.add.group();
        const winBg = this.add.rectangle(this.game.config.width / 2, this.game.config.height / 2, this.game.config.width * 0.8, 150, 0x000000, 0.85).setDepth(10);
        const winText = this.add.text(this.game.config.width / 2, this.game.config.height / 2, `YOU WIN!\nClick to Continue`,
            { fontSize: '28px', fill: '#0f0', align: 'center', padding: 10 }
        ).setOrigin(0.5).setDepth(11);
        this.winScreenGroup.addMultiple([winBg, winText]);
        this.winScreenGroup.setVisible(false);

        // Initial hint check after grid is drawn and stable
        this.time.delayedCall(100, () => { // Slight delay to ensure visuals ready
             if (!this.isGameWon) { // Don't check if game somehow starts won
                 this.checkForHints();
             }
        });
    }

    update(time, delta) {
       // Update static order display for COMPLETION
        this.gameOrders.forEach(order => {
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

        if (matches.length === 0 || this.isGameWon) {
             console.log("[ProcessMatches] No matches or game won, exiting.");
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
        let spritesToAnimateUI = null; // Store the UI sprites of the first completed order

        // --- Check Order Fulfillment ---
        console.log("[ProcessMatches] Checking order fulfillment...");
        for (let i = 0; i < this.gameOrders.length; i++) {
            const order = this.gameOrders[i];
            if (!order.completed) {
                const allRequirementsMet = order.requiredIndices.every(reqIndex => matchedIndices.includes(reqIndex));
                if (allRequirementsMet) {
                    console.log(`[ProcessMatches] Static Order ${order.id + 1} requirements met!`);
                    order.completed = true; // Mark as complete (update loop handles UI tint)
                    this.completedOrders++;
                    this.completedOrdersText.setText(`Completed: ${this.completedOrders}/${this.totalOrdersToWin}`);

                    if (!orderCompletedThisTurn) { // Store sprites for the *first* completed order only
                        orderCompletedThisTurn = true;
                        spritesToAnimateUI = order.displaySprites;
                        console.log(`[ProcessMatches] First order completed this turn (ID: ${order.id}). Storing UI sprites for animation.`);
                    }

                    // Check for win immediately
                    if (this.completedOrders >= this.totalOrdersToWin) {
                         console.log("[ProcessMatches] Win condition met during order check.");
                         // Win screen triggered later
                    }
                }
            }
        }
        console.log("[ProcessMatches] Finished checking orders.");
        // --- End Order Fulfillment Check ---

        // --- Handle Animation & Clearing or Bonus ---
        if (orderCompletedThisTurn) {
            // --- LOGGING ---
            console.log("[ProcessMatches] Order completed path chosen.");
            // --- END LOGGING ---

            // Start the non-blocking UI animation with copies of the UI sprites
            if (spritesToAnimateUI && spritesToAnimateUI.length > 0) {
                // --- LOGGING ---
                console.log("[ProcessMatches] Starting playOrderUICompleteAnimation...");
                // --- END LOGGING ---
                this.playOrderUICompleteAnimation(spritesToAnimateUI);
            } else {
                 console.log("[ProcessMatches] Order completed but no UI sprites found to animate?");
            }

            // Clear the matched items *from the grid* using the standard shrink
            // --- LOGGING ---
            console.log("[ProcessMatches] Starting shrinkAndClear for matched grid items...");
            // --- END LOGGING ---
            this.shrinkAndClear(uniqueItems, matchLocations); // Handles its own visual destruction and refill callback

             // --- LOGGING ---
            console.log("[ProcessMatches] shrinkAndClear initiated. Proceeding.");
             // --- END LOGGING ---

            // Check win condition again *after* initiating the clear
            if (this.completedOrders >= this.totalOrdersToWin && !this.isGameWon) {
                // --- LOGGING ---
                console.log("[ProcessMatches] Win condition met after order completion. Scheduling triggerWin.");
                // --- END LOGGING ---
                // Use a slight delay to allow shrink to start before win screen pops up
                this.time.delayedCall(400, this.triggerWin, [], this);
            }
            // --- LOGGING ---
            console.log("[ProcessMatches] End of order completed path (shrink/refill runs async).");
             // --- END LOGGING ---
            return; // Exit: shrinkAndClear handles the grid refill callback via clearAndRefill

        } else { // No order completed, proceed with Bonus Item Mechanic
             // --- LOGGING ---
            console.log("[ProcessMatches] No order completed. Checking for bonus...");
             // --- END LOGGING ---
            let bonusItemDataToGenerate = null;

            // --- Bonus Item Logic ---
            // 1. Find largest incomplete order(s)
            let largestIncompleteOrderSize = 0;
            let potentialTargetOrders = [];
            this.gameOrders.forEach(order => {
                if (!order.completed) {
                    if (order.requiredIndices.length > largestIncompleteOrderSize) {
                        largestIncompleteOrderSize = order.requiredIndices.length;
                        potentialTargetOrders = [order]; // Reset list
                    } else if (order.requiredIndices.length === largestIncompleteOrderSize) {
                        potentialTargetOrders.push(order);
                    }
                }
            });

            let bonusLogicHandledClear = false; // Flag if bonus logic calls clear/refill
            if (potentialTargetOrders.length > 0) {
                const targetOrder = Phaser.Utils.Array.GetRandom(potentialTargetOrders);
                // 3. Handle Match 7+
                if (matches.length >= 7) {
                    console.log("[ProcessMatches] Match 7+ bonus: Auto-completing largest order.");
                    targetOrder.completed = true;
                    this.completedOrders++;
                    this.completedOrdersText.setText(`Completed: ${this.completedOrders}/${this.totalOrdersToWin}`);
                    // Match 7+ clears directly, NO bonus items generated
                     // --- LOGGING ---
                    console.log("[ProcessMatches] Match 7+: Calling clearAndRefill directly.");
                     // --- END LOGGING ---

                    // --- FIX: Explicitly destroy visuals in Match 7+ path ---
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
                    // --- END FIX ---

                    this.clearAndRefill(uniqueItems, matchLocations);
                    bonusLogicHandledClear = true; // Mark that clear was handled
                    if (this.completedOrders >= this.totalOrdersToWin && !this.isGameWon) {
                         console.log("[ProcessMatches] Match 7+: Win condition met. Triggering win.");
                         this.triggerWin();
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
                        // --- Determine Bonus Color ---
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

                        // --- Select Bonus Item Indices ---
                        const bonusItemIndices = [];
                        for (let i = 0; i < numBonusItems; i++) {
                            bonusItemIndices.push(Phaser.Utils.Array.GetRandom(targetOrder.requiredIndices));
                        }
                        console.log(`[ProcessMatches] Bonus item indices: ${bonusItemIndices.join(', ')}`);

                        // --- Prepare Bonus Item Data ---
                        bonusItemDataToGenerate = [];
                        for (let i = 0; i < numBonusItems && i < matchLocations.length; i++) {
                             bonusItemDataToGenerate.push({
                                spriteIndex: bonusItemIndices[i],
                                color: bonusColor,
                                x: matchLocations[i].x,
                                y: matchLocations[i].y
                             });
                        }
                         console.log(`[ProcessMatches] Prepared ${bonusItemDataToGenerate.length} bonus items.`);
                    } else {
                         console.log("[ProcessMatches] Match size doesn't qualify for bonus items.");
                    }
                }
            } else {
                 console.log("[ProcessMatches] No incomplete orders found for bonus check.");
            }
             // --- End Bonus Item Logic ---

             // --- Clear Visuals and Refill (Based on Bonus/Normal) ---
             if (!bonusLogicHandledClear) { // Only run if Match 7+ didn't already clear
                if (bonusItemDataToGenerate && bonusItemDataToGenerate.length > 0) {
                    // --- LOGGING ---
                    console.log("[ProcessMatches] Bonus items generated. Destroying original visuals then calling clearAndRefill.");
                    // --- END LOGGING ---
                    // --- FIX: Destroy original matched visuals FIRST in bonus path ---
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
                    // --- END FIX ---
                    this.clearAndRefill(uniqueItems, matchLocations, bonusItemDataToGenerate);
                } else {
                    // --- LOGGING ---
                    console.log("[ProcessMatches] No bonus generated. Starting standard shrinkAndClear.");
                    // --- END LOGGING ---
                    this.shrinkAndClear(uniqueItems, matchLocations); // Handles its own visual destruction and refill callback
                }
             } else {
                  console.log("[ProcessMatches] Clear/Refill already handled by bonus logic (Match 7+).");
             }
             // --- LOGGING ---
            console.log("[ProcessMatches] End of non-order-completed path (clear/refill runs async or was direct).");
            // --- END LOGGING ---
        }
         // --- LOGGING ---
        console.log("[ProcessMatches] End of function.");
         // --- END LOGGING ---
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

    // generateReplacements - Add logs
    generateReplacements(locations, bonusData = null) {
        // --- LOGGING ---
        console.log(`[GenerateReplacements] Start. Locations: ${locations.length}. Bonus items: ${bonusData ? bonusData.length : 0}.`);
        // --- END LOGGING ---
        let newlyGeneratedItems = [];
        const newSprites = [];
        const newBackgrounds = []; // Restore background array
        const locationsFilledByBonus = new Set();
        const locationKey = (loc) => `${loc.x},${loc.y}`;

        // 1. Generate Specific Bonus Items First
        if (bonusData) {
             console.log(`[GenerateReplacements] Generating ${bonusData.length} bonus items.`);
             bonusData.forEach(bonusItem => {
                // ... (generate bonus item data, create visuals, add to arrays) ...
                const { x, y, spriteIndex, color } = bonusItem;
                const newItemData = { spriteIndex, color, x, y, sprite: null };
                this.grid[y][x] = newItemData;
                // Create visuals (returns object with sprite and background)
                const visuals = this._createGridItemVisuals(newItemData, x, y);
                if (visuals.sprite) newSprites.push(visuals.sprite); // Add sprite
                if (visuals.background) newBackgrounds.push(visuals.background); // Add background
                locationsFilledByBonus.add(locationKey({x, y}));
                newlyGeneratedItems.push(newItemData);
             });
        }

        // 2. Generate Random Replacements for Remaining Locations
        console.log(`[GenerateReplacements] Generating random replacements for remaining ${locations.length - locationsFilledByBonus.size} locations.`);
        locations.forEach(loc => {
            if (locationsFilledByBonus.has(locationKey(loc))) return;
            // ... (generate random item data, create visuals, add to arrays) ...
            const { x, y } = loc;
            if (this.grid[y]?.[x] !== null) {
                console.warn(`[GenerateReplacements] Location (${x},${y}) already filled? Skipping.`);
                return;
            }
            const newItemData = this.generateNonMatchingItem(x, y);
            this.grid[y][x] = newItemData;
            // Create visuals (returns object with sprite and background)
            const visuals = this._createGridItemVisuals(newItemData, x, y);
             if (visuals.sprite) newSprites.push(visuals.sprite); // Add sprite
             if (visuals.background) newBackgrounds.push(visuals.background); // Add background
            newlyGeneratedItems.push(newItemData);
        });

        // 3. Start Simultaneous Appear Tweens
        // Check both arrays
        if (newSprites.length > 0 || newBackgrounds.length > 0) {
            // --- LOGGING ---
            console.log(`[GenerateReplacements] Starting appear tweens for ${newSprites.length} sprites and ${newBackgrounds.length} backgrounds.`);
            // --- END LOGGING ---

            // Tween backgrounds if they exist
            if (newBackgrounds.length > 0) {
                 this.tweens.add({ targets: newBackgrounds, scaleX: 1, scaleY: 1, alpha: 1, duration: APPEAR_DURATION, ease: 'Power2' });
            }
             // Tween sprites if they exist
             if (newSprites.length > 0) {
                this.tweens.add({ targets: newSprites,
                    // Directly tween displayWidth and displayHeight instead of scale
                    displayWidth: SPRITE_SIZE,
                    displayHeight: SPRITE_SIZE,
                    alpha: 1,
                    duration: APPEAR_DURATION, ease: 'Power2' });
             }
        } else {
            console.log("[GenerateReplacements] No new sprites/backgrounds to animate.");
        }

        // --- LOGGING ---
        console.log("[GenerateReplacements] Calling preventAutoMatches.");
        // --- END LOGGING ---
        this.preventAutoMatches(newlyGeneratedItems);
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
            if (itemData.sprite) {
                 this.tweens.killTweensOf(itemData.sprite);
                 try { itemData.sprite.setAlpha(1); } catch (e) { /* ... */ }
            }
        });
        this.hintedItems.clear();

        // Stop order display hints
        this.hintedOrderSprites.forEach(sprite => {
            if (sprite && sprite.scene) { 
                this.tweens.killTweensOf(sprite);
                try { sprite.setAlpha(1); } catch (e) { /* ... */ }
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
        if (this.isGameWon) return;
        
        this.stopAllHints(); // Clear previous hints and timer first

        const potentialHintsByColor = new Map(); // Map<color, Set<itemData>>

        // 1. Check each eligible order and color combination
        this.gameOrders.forEach(order => {
            if (!order.completed && order.requiredIndices.length >= 3) {
                for (const color of COLORS) {
                    const allPresentWithThisColor = order.requiredIndices.every(reqIdx => 
                        this.gridContainsItem(reqIdx, color)
                    );

                    if (allPresentWithThisColor) {
                        // If condition met, find *all* items matching index AND color
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
                    }
                } // End color loop
            }
        }); // End order loop

        // 2. Store the colors that actually have hints
        this.availableHintColors = Array.from(potentialHintsByColor.keys());

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
        if (this.isGameWon || !this.availableHintColors || this.availableHintColors.length === 0) {
            this.stopAllHints(); 
            return;
        }

        // --- Reset alpha of previously hinted ITEMS --- 
        this.hintedItems.forEach(itemData => {
            if (itemData.sprite) {
                 try { itemData.sprite.setAlpha(1); } catch(e) { /* ... */ }
            }
        });
        this.hintedItems.clear(); 

        // --- Reset alpha of previously hinted order SPRITES --- 
        this.hintedOrderSprites.forEach(sprite => {
             if (sprite && sprite.scene) { 
                 try { sprite.setAlpha(1); } catch (e) { /* ... */ }
             }
        });
        this.hintedOrderSprites.clear();
        // --- --- --- --- --- --- --- --- --- --

        // Determine the color for this cycle
        const hintColorToShow = this.availableHintColors[this.currentHintColorIndex];

        // Re-find items AND order SPRITES for this specific color hint
        const itemsToAnimateNow = new Set();
        const orderSpritesToAnimateNow = new Set(); // Store corresponding order SPRITES

        this.gameOrders.forEach(order => {
            if (!order.completed && order.requiredIndices.length >= 3) {
                 const allPresentWithThisColor = order.requiredIndices.every(reqIdx => 
                     this.gridContainsItem(reqIdx, hintColorToShow)
                 );
                 if (allPresentWithThisColor) {
                     // If this order is hintable, add its DISPLAY SPRITES to the set
                     if (order.displaySprites && order.displaySprites.length > 0) { 
                         order.displaySprites.forEach(sprite => orderSpritesToAnimateNow.add(sprite));
                     }
                     // Find grid items (remains same)
                     order.requiredIndices.forEach(reqIdx => {
                         for (let y = 0; y < GRID_HEIGHT; y++) {
                             for (let x = 0; x < GRID_WIDTH; x++) {
                                 const itemData = this.grid[y]?.[x];
                                 if (itemData && itemData.spriteIndex === reqIdx && itemData.color === hintColorToShow) {
                                     itemsToAnimateNow.add(itemData);
                                 }
                             }
                         }
                     });
                 }
            }
        });

        // Start the single ALPHA pulse animation for grid ITEMS
        itemsToAnimateNow.forEach(itemData => {
            if (itemData.sprite) { 
                this.hintedItems.add(itemData); // Track for potential cleanup
                this.tweens.add({
                    targets: itemData.sprite,
                    alpha: 0.6, 
                    duration: 250, 
                    yoyo: true 
                });
            }
        });

        // Start the single ALPHA pulse animation for ORDER SPRITES
        orderSpritesToAnimateNow.forEach(sprite => {
            this.hintedOrderSprites.add(sprite); // Track the SPRITE for next cleanup
            this.tweens.add({
                targets: sprite, // Target the SPRITE
                alpha: 0.6, 
                duration: 250, 
                yoyo: true 
            });
        });

        // Move to the next color index
        this.currentHintColorIndex = (this.currentHintColorIndex + 1) % this.availableHintColors.length;
    }

    // --- Order System Methods (Simplified) ---
    triggerWin() {
        console.log("YOU WIN!");
        this.isGameWon = true;
        this.canSwap = false; // Disable further swaps
        this.winScreenGroup.setVisible(true);

        // Listen for a single click/tap anywhere to dismiss
        this.input.once('pointerdown', this.dismissWinScreen, this);
    }
    dismissWinScreen() {
         console.log("Dismissing win screen and restarting...");
         this.winScreenGroup.setVisible(false);
         this.restartGame(); // Call the restart function
    }

    // --- NEW Game Reset Function ---
    restartGame() {
        console.log("--- RESTARTING GAME ---");
        this.isGameWon = false;
        this.completedOrders = 0;
        this.stopAllHints(); // Stop hints before resetting visuals

        // Reset orders visually and data-wise
        this.gameOrders.forEach(order => {
            order.completed = false;
            // Reset tint/alpha (handled by update now, but good practice)
            if(order.displayLabel) order.displayLabel.setAlpha(1);
            order.displaySprites.forEach(sprite => {
                sprite.clearTint();
                sprite.setAlpha(1);
            });
        });
        this.completedOrdersText.setText(`Completed: ${this.completedOrders}/${this.totalOrdersToWin}`);

        // Clear existing grid visuals and data
        this.items.clear(true, true); // Destroy sprites, backgrounds, text
        this.grid = []; // Reset grid data array

        // Re-initialize grid
        this.refillItemGenerationBag(); // Important to refill before creating data
        this.createGridData(); // Creates data, calls preventAutoMatches(false)
        this.drawGrid(); // Redraws grid visuals

        // Enable swapping
        this.canSwap = true;
        // Initial hint check after restart
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

    // Moved preventAutoMatches and regenerateItemColor UP to be defined before createGridData calls them
    preventAutoMatches(newlyGeneratedItems, enableSwapOnFinish = true) {
        let loops = 0; const maxLoops = GRID_WIDTH * GRID_HEIGHT;
        while (loops < maxLoops) {
            loops++;
            const autoMatches = this.findMatches();
            if (autoMatches.length === 0) {
                // console.log("No auto-matches found.");
                break; 
            }
            const itemsToRegenerate = [...new Set(autoMatches)];
            console.log(`Auto-match detected! Regenerating ${itemsToRegenerate.length} items.`);
            if (itemsToRegenerate.length === 0) { console.warn("autoMatches > 0 but no unique items? Breaking."); break; }
            itemsToRegenerate.forEach(itemData => { this.regenerateItemColor(itemData); });
        }
        if (loops >= maxLoops) { console.error("Max loops reached in preventAutoMatches."); }
        
        // Board is now stable, check for hints AFTER appear animations complete
        this.time.delayedCall(APPEAR_DURATION + 50, this.checkForHints, [], this); // REINSTATED DELAY
        
        if (enableSwapOnFinish) {
             this.canSwap = true; 
        }
    }

    regenerateItemColor(itemData) {
        const { x, y } = itemData;
        const originalColor = itemData.color;
        let loops = 0;

        while (loops < COLORS.length + 1) {
             loops++;
             let newColor = Phaser.Utils.Array.GetRandom(COLORS);
             if (newColor !== originalColor && !this.checkMatchAt(x, y, newColor)) {
                 // Found a safe color
                 itemData.color = newColor;
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