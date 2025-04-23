// Define Constants directly in game.js again
const GRID_WIDTH = 6;
const GRID_HEIGHT = 6;
const TILE_SIZE = 60; 
const UI_AREA_HEIGHT = 160; 
const SPRITE_SHEET_KEY = 'foodSprites';
const SPRITE_WIDTH = 16;
const SPRITE_HEIGHT = 16;
const TOTAL_SPRITES = 81;
const SPRITES_PER_ROW = 9; 
const ITEM_TYPES_TO_USE = 10; 
const COLORS = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff]; 

const SPRITE_NAMES = [
    "Red Apple", "Green Apple", "Cookie", "Egg", "Scrambled Egg", // 0-4
    "Cheese", "Baguette", "Potato", "Onion", "Water"          // 5-9
]; 

const STATIC_ORDERS_DEF = [
    { id: 0, requiredIndices: [0] },                 // Order 1: Red Apple
    { id: 1, requiredIndices: [1, 2] },              // Order 2: Green Apple, Cookie
    { id: 2, requiredIndices: [3, 4, 5] },           // Order 3: Egg, Scrambled Egg, Cheese
    { id: 3, requiredIndices: [6, 7, 8, 9] },        // Order 4: Baguette, Potato, Onion, Water
    { id: 4, requiredIndices: [0, 2, 4, 6, 8] }      // Order 5: Red Apple, Cookie, Scrambled Egg, Baguette, Onion 
];

let game;

class BootScene extends Phaser.Scene {
    constructor() {
        super({ key: 'BootScene' });
    }

    preload() {
        console.log("BootScene: Preloading assets...");
        // Use constants defined in constants.js
        this.load.spritesheet(SPRITE_SHEET_KEY, 'sprites/fooddd.png', {
            frameWidth: SPRITE_WIDTH,
            frameHeight: SPRITE_HEIGHT
        });
        
        console.log("BootScene: Preloading sounds...");
        this.load.audio('swapSound', 'sounds/swap.mp3');
        this.load.audio('matchSound', 'sounds/match.mp3');
        this.load.audio('bgm', 'sounds/bgm(reddish).mp3');
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
                const sprite = this.add.sprite(spriteX, currentY + orderLineHeight / 2, SPRITE_SHEET_KEY, itemIndex)
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
        for (let y = 0; y < GRID_HEIGHT; y++) {
            for (let x = 0; x < GRID_WIDTH; x++) {
                const gridItem = this.grid[y][x];
                if (!gridItem) { console.error(`Null item at (${x},${y}) in drawGrid`); continue; }
                
                this._createGridItemVisuals(gridItem, x, y); // Use helper
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
        this.canSwap = false;

        this.sound.play('swapSound', { volume: 0.5 });

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
                this.processMatches(allMatches); // processMatches calls stopAllHints
            } else {
                this.canSwap = true;
                // Check for hints AFTER board is stable from a non-matching swap
                this.checkForHints(); // checkForHints calls stopAllHints
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
            targets: item1,
            x: targetPos1.x,
            y: targetPos1.y,
            duration: 200, 
            ease: 'Power2',
            onUpdate: (tween, target) => { // Update background position during tween
                 this._setGridItemVisualPosition(target, target.x, target.y);
            },
            onComplete: (tween, targets) => { // Ensure final position is exact
                targets.forEach(target => this._setGridItemVisualPosition(target, targetPos1.x, targetPos1.y));
            }
        });

        // Tween item2 to targetPos2
        this.tweens.add({
            targets: item2,
            x: targetPos2.x,
            y: targetPos2.y,
            duration: 200, 
            ease: 'Power2',
            onUpdate: (tween, target) => {
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
        if (matches.length === 0 || this.isGameWon) {
            // If no matches, ensure hints are checked if board state allows
            if (!this.isGameWon && this.canSwap) this.checkForHints(); 
            return;
        }
        
        this.sound.play('matchSound', { volume: 0.6 }); 
        this.stopAllHints(); // Stop hints before processing
        this.canSwap = false; // Disable swaps during processing

        console.log(`Processing ${matches.length} matched items.`);
        const uniqueItems = [...new Set(matches)];
        const matchedIndices = uniqueItems.map(itemData => itemData.spriteIndex);
        const matchLocations = uniqueItems.map(itemData => ({ x: itemData.x, y: itemData.y })); // Store locations for potential refill

        let orderCompletedThisTurn = false;
        // --- Check Order Fulfillment --- 
        for (let i = 0; i < this.gameOrders.length; i++) {
            const order = this.gameOrders[i];
            if (!order.completed) {
                const allRequirementsMet = order.requiredIndices.every(reqIndex => matchedIndices.includes(reqIndex));
                if (allRequirementsMet) {
                    console.log(`Static Order ${order.id + 1} requirements met by match!`);
                    order.completed = true;
                    this.completedOrders++;
                    this.completedOrdersText.setText(`Completed: ${this.completedOrders}/${this.totalOrdersToWin}`);
                    orderCompletedThisTurn = true;
                    
                    if (this.completedOrders >= this.totalOrdersToWin) {
                        this.triggerWin();
                        return; // Exit early on win
                    }
                    // Don't break, allow multiple orders potentially completed by one match?
                }
            }
        }
        // --- End Order Fulfillment Check ---

        // --- Bonus Item Mechanic --- 
        let bonusItemDataToGenerate = null; // Initialize as null

        if (!orderCompletedThisTurn) {
            console.log("Match did not complete order, checking for bonus...");

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

            if (potentialTargetOrders.length > 0) {
                // 2. Select target order (random tie-break)
                const targetOrder = Phaser.Utils.Array.GetRandom(potentialTargetOrders);
                console.log(`Target order for bonus: Order ${targetOrder.id + 1} (Size: ${largestIncompleteOrderSize})`);

                // 3. Handle Match 7+
                if (matches.length >= 7) {
                    console.log("Match 7+ bonus: Auto-completing largest order.");
                    targetOrder.completed = true;
                    this.completedOrders++;
                    this.completedOrdersText.setText(`Completed: ${this.completedOrders}/${this.totalOrdersToWin}`);
                     // Still need to clear the original match visuals
                    this.clearAndRefill(uniqueItems, matchLocations); // No bonus data needed
                    if (this.completedOrders >= this.totalOrdersToWin) {
                         this.triggerWin();
                    }
                    return; // Exit after handling Match 7+
                }

                // 4. Handle Match 3-6: Calculate bonus items
                let numBonusItems = 0;
                if (matches.length === 3) numBonusItems = 1;
                else if (matches.length === 4) numBonusItems = 2;
                else if (matches.length === 5) numBonusItems = 3;
                else if (matches.length === 6) numBonusItems = 4;

                if (numBonusItems > 0) {
                    // 5. Determine Bonus Color
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
                    console.log(`Bonus color chosen: ${bonusColor.toString(16)} (Count: ${maxCount})`);

                    // 6. Select Bonus Item Indices
                    const bonusItemIndices = [];
                    for (let i = 0; i < numBonusItems; i++) {
                        bonusItemIndices.push(Phaser.Utils.Array.GetRandom(targetOrder.requiredIndices));
                    }
                    console.log(`Bonus item indices: ${bonusItemIndices.join(', ')}`);

                    // 7. Prepare Bonus Item Data Mapped to First N Match Locations
                    bonusItemDataToGenerate = [];
                    for (let i = 0; i < numBonusItems && i < matchLocations.length; i++) {
                        bonusItemDataToGenerate.push({
                            spriteIndex: bonusItemIndices[i],
                            color: bonusColor,
                            x: matchLocations[i].x, // Use location from original match
                            y: matchLocations[i].y
                        });
                    }
                }
            } else {
                 console.log("No incomplete orders found for bonus.");
            }
        } // End bonus mechanic check

        // --- Clear Visuals and Refill --- 
        // If bonus items were generated, call clearAndRefill immediately with bonus data
        // Otherwise, proceed with normal shrink animation
        if (bonusItemDataToGenerate) {
             console.log("Calling clearAndRefill with bonus data.");
             this.clearAndRefill(uniqueItems, matchLocations, bonusItemDataToGenerate);
        } else {
            // Original Shrink Animation Logic
            console.log("No bonus or order completed, proceeding with normal shrink.");
            let tweensCompleted = 0;
            const totalTweens = uniqueItems.length;

            uniqueItems.forEach(itemData => {
                if (itemData.sprite) {
                    this.tweens.killTweensOf(itemData.sprite); // Kill hint tweens
                    const targets = [itemData.sprite, itemData.sprite.getData('background')].filter(t => t);
                    if (targets.length > 0) {
                        this.tweens.add({
                            targets: targets,
                            scaleX: 0, scaleY: 0, alpha: 0,
                            duration: 300, ease: 'Power2',
                            onComplete: () => {
                                tweensCompleted++;
                                if (tweensCompleted === totalTweens) { 
                                    this.clearAndRefill(uniqueItems, matchLocations); // Pass locations
                                }
                            }
                        });
                    } else { 
                        tweensCompleted++; if (tweensCompleted === totalTweens) { this.clearAndRefill(uniqueItems, matchLocations); } 
                    }
                } else { 
                    tweensCompleted++; if (tweensCompleted === totalTweens) { this.clearAndRefill(uniqueItems, matchLocations); } 
                }
            });
        }
    }

    // Modify clearAndRefill signature
    clearAndRefill(removedItems, locations, bonusData = null) {
        console.log(`Clearing data (Bonus Data Present: ${!!bonusData}). Triggering replacement.`);
        removedItems.forEach(itemData => {
             // Grid null check...
             if (this.grid[itemData.y] && this.grid[itemData.y][itemData.x] === itemData) {
                  this.grid[itemData.y][itemData.x] = null;
             } else {
                 if(this.grid[itemData.y]) this.grid[itemData.y][itemData.x] = null;
             }

             // Destroy associated visuals...
             if (itemData.sprite) {
                 const sprite = itemData.sprite;
                 const background = sprite.getData('background');
                 if (sprite) sprite.destroy();
                 if (background) background.destroy();
             }
             itemData.sprite = null; 
        });
        
        // Pass bonusData down to generateReplacements
        this.generateReplacements(locations, bonusData);
    }

    // Modify generateReplacements signature & logic
    generateReplacements(locations, bonusData = null) {
        let newlyGeneratedItems = [];
        const locationsFilledByBonus = new Set(); // Track locations used by bonus items
        const locationKey = (loc) => `${loc.x},${loc.y}`; // Helper for Set keys

        // 1. Generate Specific Bonus Items First
        if (bonusData) {
             console.log(`Generating ${bonusData.length} bonus items.`);
             bonusData.forEach(bonusItem => {
                const { x, y, spriteIndex, color } = bonusItem;
                // Create data structure (similar to generateNonMatchingItem but with fixed values)
                 const newItemData = { spriteIndex, color, x, y, sprite: null }; 
                 this.grid[y][x] = newItemData;
                 
                 console.log(`Placing bonus item ${spriteIndex+1} (${color.toString(16)}) at (${x},${y})`);
                 this._createGridItemVisuals(newItemData, x, y); // Use helper

                 locationsFilledByBonus.add(locationKey({x, y}));
                 newlyGeneratedItems.push(newItemData);
             });
        }

        // 2. Generate Random Replacements for Remaining Locations
        locations.forEach(loc => {
            // Skip locations already filled by bonus items
            if (locationsFilledByBonus.has(locationKey(loc))) {
                return; 
            }

            // Regular random generation for this empty spot
            const { x, y } = loc;
            if (this.grid[y]?.[x] !== null) { 
                 // This might happen if a bonus item replaced an item that wasn't part of the original match? 
                 // Or if locations has duplicates? Let's guard against it.
                 console.warn(`generateReplacements: Location (${x},${y}) already filled, skipping random generation.`);
                 return; 
            }
            const newItemData = this.generateNonMatchingItem(x, y);
            this.grid[y][x] = newItemData;

            this._createGridItemVisuals(newItemData, x, y); // Use helper

            newlyGeneratedItems.push(newItemData);
        });

        console.log("Replacement generation complete, checking auto-matches...");
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
        const bgSize = TILE_SIZE * 0.9;
        const spriteSize = TILE_SIZE * 0.75;
        const cornerRadius = 10;

        // Create Background Graphics
        const graphicsX = tileCenterX - bgSize / 2;
        const graphicsY = tileCenterY - bgSize / 2;
        const backgroundGraphics = this.add.graphics({ x: graphicsX, y: graphicsY });
        backgroundGraphics.fillStyle(itemData.color, 1);
        backgroundGraphics.fillRoundedRect(0, 0, bgSize, bgSize, cornerRadius); 
        backgroundGraphics.setDepth(0);

        // Create Sprite
        const itemSprite = this.items.create(tileCenterX, tileCenterY, SPRITE_SHEET_KEY, itemData.spriteIndex)
            .setDisplaySize(spriteSize, spriteSize)
            .setInteractive()
            .setDepth(1);
        itemSprite.clearTint();

        // Store references
        itemData.sprite = itemSprite;
        itemSprite.setData('gridData', itemData);
        itemSprite.setData('background', backgroundGraphics);

        return itemSprite; // Return the main sprite object
    }

    // Helper to set position of sprite and its background
    _setGridItemVisualPosition(itemSprite, worldX, worldY) {
        if (!itemSprite) return;

        itemSprite.setPosition(worldX, worldY);

        const background = itemSprite.getData('background');
        if (background) {
            const bgSize = TILE_SIZE * 0.9;
            const graphicsX = worldX - bgSize / 2; // Calculate top-left for graphics
            const graphicsY = worldY - bgSize / 2;
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
        
        // Board is now stable, check for hints BEFORE enabling swap
        this.checkForHints();
        
        if (enableSwapOnFinish) {
             this.canSwap = true; 
        }
    }

    regenerateItemColor(itemData) {
        const { x, y } = itemData;
        const originalColor = itemData.color;
        let loops = 0;

        while (loops < COLORS.length + 1) { // Try all colors + 1 safety
             loops++;
             let newColor = Phaser.Utils.Array.GetRandom(COLORS);
             if (newColor !== originalColor && !this.checkMatchAt(x, y, newColor)) {
                 // Found a safe color
                 itemData.color = newColor;
                 const background = itemData.sprite?.getData('background');
                 if (background) {
                     background.setFillStyle(newColor);
                 }
                 // console.log(`Regenerated item at (${x}, ${y}) to color ${newColor}`);
                 return; // Exit function
             }
        }
        // If we somehow tried all colors and none worked (very unlikely)
        console.warn(`Could not find a non-matching color for item at (${x}, ${y}) after ${loops} attempts.`);
        // Leave the item as is, the loop in preventAutoMatches might fix neighbors
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