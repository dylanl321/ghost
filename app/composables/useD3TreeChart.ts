import { ref } from 'vue'
import * as d3 from 'd3'

export interface TreeNode {
  name: string
  id: string
  type: string
  budget?: number
  spend?: number
  children?: TreeNode[]
  _children?: TreeNode[] // For collapsed state
}

export function useD3TreeChart() {
  let zoom: any
  let svg: any
  let g: any
  let root: any
  let tree: any
  let onNodeToggleCallback: (() => void) | null = null
  
  const nodeWidth = 300
  const nodeHeight = 140
  
  const selectedNodeId = ref<string | null>(null)

  const drawChart = (data: TreeNode) => {
    setTimeout(() => {
      const container = document.querySelector('.visualization-container')
      if (!container) return

      // Get container bounds and ensure minimum dimensions
      const containerRect = container.getBoundingClientRect()
      const width = Math.max(containerRect.width || 900, 800)
      const height = Math.max(containerRect.height || 600, 600)
      
      console.log('Canvas dimensions:', { width, height, containerRect })
      
      // Set up responsive resize observer
      if (window.ResizeObserver) {
        const resizeObserver = new ResizeObserver(() => {
          const newRect = container.getBoundingClientRect()
          const newWidth = Math.max(newRect.width || 900, 800)
          const newHeight = Math.max(newRect.height || 600, 600)
          
          if (svg && (Math.abs(newWidth - width) > 50 || Math.abs(newHeight - height) > 50)) {
            svg.attr('width', newWidth).attr('height', newHeight)
            fitChartToContainer()
          }
        })
        resizeObserver.observe(container)
        
        // Store reference to cleanup later
        ;(container as any)._resizeObserver = resizeObserver
      }

      // Clear and create fresh SVG
      d3.select(container).select("svg").remove()

      svg = d3.select(container)
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .style("background", "#111827")

      // Calculate max scale based on 4 nodes width
      const containerWidth = width
      const fourNodesWidth = nodeWidth * 4.5 // 4 nodes + spacing
      const maxScale = Math.max(0.8, containerWidth / fourNodesWidth) // At least 0.8x, but limit to 4 nodes width
      
      zoom = d3.zoom()
        .scaleExtent([0.2, maxScale])
        .on("zoom", (event) => {
          g.attr("transform", event.transform)
          
          // Dynamically adjust text size based on zoom level
          const scale = event.transform.k
          const textScale = Math.max(0.8, Math.min(1.2, 1 / scale))
          
          g.selectAll(".node-header")
            .style("font-size", `${14 * textScale}px`)
          g.selectAll(".node-subheader")
            .style("font-size", `${10 * textScale}px`)
          g.selectAll(".node-metric, .node-metric-value")
            .style("font-size", `${9 * textScale}px`)
        })

      svg.call(zoom)
        .on("wheel.zoom", event => {
          event.preventDefault()
          const delta = event.deltaY * -0.002
          svg.transition()
            .duration(50)
            .call(zoom.scaleBy, 1 + delta)
        })

      g = svg.append("g")
        .attr("transform", "translate(50, 50)")

      tree = d3.tree()
        .nodeSize([nodeWidth, nodeHeight * 1.5])
        .separation((a, b) => {
          if (a.parent === b.parent) {
            if (a.data.type === 'account' && b.data.type === 'account') {
              return 0.6
            }
            return 1.2
          }
          if (a.data.type === 'account' || b.data.type === 'account') {
            return 1.2
          }
          return 1.8
        })

      root = d3.hierarchy(data, d => d.children)

      // Initially: show only master node (LOBs collapsed)
      if (root.children) {
        root.children.forEach(lob => {
          // Collapse each LOB completely
          if (lob.children) {
            lob._children = lob.children
            lob.children = null
          }
        })
        // Also hide the LOBs initially - only show master
        root._children = root.children
        root.children = null
      }
      
      console.log('Initial state: only master visible, all LOBs collapsed')

      const diagonal = (d: any) => {
        const source = d.source
        const target = d.target

        // Check if target is part of a grid layout
        const isGridLayout = source.data.type === 'department' && 
          source.children && 
          source.children.length > 8 &&
          target.data.type === 'account'

        if (isGridLayout) {
          // Use straight lines for grid layout
          return `M ${source.x} ${source.y}
                  L ${target.x} ${target.y}`
        } else {
          // Use curved lines for tree layout
          return d3.linkVertical()
            .x((d: any) => d.x)
            .y((d: any) => d.y)
            .source(() => ({ x: source.x, y: source.y }))
            .target(() => ({ x: target.x, y: target.y }))()
        }
      }

      function toggleNode(d: any) {
        toggleNodeWithNeighborCollapse(d)
      }

      function collapseNode(d: any) {
        if (d.children) {
          d.children.forEach(collapseNode)
          d._children = d.children
          d.children = null
        }
      }

      function arrangeAccountNodes(nodes: d3.HierarchyNode<any>[]) {
        nodes.forEach(d => {
          if (d.data.type === 'department' && d.children) {
            console.log("arranging nodes...")
            const COLUMNS = Math.ceil(Math.sqrt(d.children.length))
            const SPACING_X = nodeWidth * 1.1
            const SPACING_Y = nodeHeight * 1.2
            
            // Calculate total grid height and width
            const totalWidth = COLUMNS * SPACING_X

            // Center the grid relative to the parent
            const startX = d.x - (totalWidth / 2) + (SPACING_X / 2)
            const startY = d.y + nodeHeight * 1.5

            d.children.forEach((child, i) => {
              const row = Math.floor(i / COLUMNS)
              const col = i % COLUMNS
              child.x = startX + (col * SPACING_X)
              child.y = startY + (row * SPACING_Y)
            })
          }
        })
      }

      function update(source: any) {
        tree(source)

        // Get all nodes and arrange them
        const descendants = source.descendants()
        arrangeAccountNodes(descendants)

        // Update links with new diagonal function
        const links = g.selectAll(".link")
          .data(source.links())
          .join("path")
          .attr("class", "link")
          .attr("d", diagonal)

        const nodes = g.selectAll(".node")
          .data(descendants)
          .join("g")
          .attr("class", d => `node ${d.data.type} ${d._children ? 'collapsed' : ''}`)
          .attr("transform", d => `translate(${d.x},${d.y})`)

        nodes.selectAll("*").remove()

        // Add styled node boxes with proper interactions
        nodes.append("rect")
          .attr("class", d => `node-box ${d.data.type}`)
          .attr("x", -nodeWidth / 2)
          .attr("y", -nodeHeight / 2)
          .attr("width", nodeWidth)
          .attr("height", nodeHeight)
          .attr("rx", 8)
          .attr("ry", 8)
          .style("fill", d => getNodeBackgroundColor(d.data))
          .style("stroke", d => getNodeStrokeColor(d.data))
          .style("stroke-width", 2)
          .style("filter", "drop-shadow(0 4px 6px rgba(0, 0, 0, 0.3))")
          .style("cursor", "pointer")
          .style("transition", "all 0.2s ease")
          .on("click", function(event, d) {
            event.stopPropagation()
            console.log('Node clicked immediately:', d.data.name)
            
            // Immediate visual feedback
            d3.selectAll(".node-box")
              .style("stroke", getNodeStrokeColor)
              .style("stroke-width", 2)
              .style("filter", null)
            
            d3.select(this)
              .style("stroke", "#3b82f6")
              .style("stroke-width", 3)
              .style("filter", "brightness(1.2)")
            
            // Set selected node immediately
            selectedNodeId.value = d.data.id
            
            // Toggle if has children (with neighbor collapse)
            if (d.children || d._children) {
              toggleNodeWithNeighborCollapse(d)
              
              // Center on children after expansion with delay
              setTimeout(() => {
                // Re-fetch the node after update to get correct children positions
                const updatedNode = d3.selectAll('.node').filter((n: any) => n.data.id === d.data.id).datum()
                centerOnNode(updatedNode || d)
              }, 550)
            } else {
              // For leaf nodes, just center immediately
              centerOnNode(d)
            }
          })
          .on("mouseenter", function(event, d) {
            d3.select(this)
              .transition()
              .duration(100)
              .style("filter", "brightness(1.1) drop-shadow(0 6px 12px rgba(0,0,0,0.4))")
              .style("transform", "scale(1.02)")
          })
          .on("mouseleave", function(event, d) {
            if (d.data.id !== selectedNodeId.value) {
              d3.select(this)
                .transition()
                .duration(100)
                .style("filter", "drop-shadow(0 4px 6px rgba(0, 0, 0, 0.3))")
                .style("transform", null)
            }
          })

        // Add node content
        nodes.append("g")
          .attr("class", "node-content")
          .attr("transform", `translate(${-nodeWidth / 2 + 15}, ${-nodeHeight / 2 + 15})`)
          .style("pointer-events", "none") // Ensure text doesn't block clicks

        // Add node details
        nodes.each(function(d) {
          const nodeContent = d3.select(this).select(".node-content")

          // Add header text with better styling
          nodeContent.append("text")
            .attr("class", "node-header")
            .attr("y", 20)
            .attr("x", 10)
            .style("fill", "#ffffff")
            .style("font-weight", "600")
            .style("font-size", "14px")
            .text(d => {
              // Truncate long names
              return d.data.name.length > 30 ? d.data.name.substring(0, 27) + '...' : d.data.name
            })

          // Add subheader (ID) with better visibility
          nodeContent.append("text")
            .attr("class", "node-subheader")
            .attr("y", 40)
            .attr("x", 10)
            .style("fill", "#d1d5db")
            .style("font-size", "10px")
            .text(d => d.data.id)

          // Add utilization circle
          const progressGroup = nodeContent.append("g")
            .attr("transform", `translate(${nodeWidth - 70}, 65)`)

          progressGroup.append("circle")
            .attr("class", "node-progress-container")
            .attr("r", 30)
            .attr("cx", 0)
            .attr("cy", 0)

          const progress = d.data.spend / d.data.budget
          const arc = d3.arc()
            .innerRadius(26)
            .outerRadius(34)
            .startAngle(0)
            .endAngle(Math.PI * 2 * progress)

          progressGroup.append("path")
            .attr("d", arc)
            .attr("fill", getUtilizationColor(d.data))

          progressGroup.append("text")
            .attr("class", "node-utilization")
            .attr("text-anchor", "middle")
            .attr("dy", "0.35em")
            .attr("fill", getUtilizationColor(d.data))
            .text(`${(progress * 100).toFixed(0)}%`)

          // Add metrics
          const metrics = nodeContent.append("g")
            .attr("transform", "translate(10, 60)")

          metrics.append("text")
            .attr("class", "node-metric")
            .text("Budget")

          metrics.append("text")
            .attr("class", "node-metric-value")
            .attr("y", 20)
            .text(d => `$${formatNumber(d.data.budget)}`)

          metrics.append("text")
            .attr("class", "node-metric")
            .attr("x", nodeWidth / 2 - 50)
            .text("Spend")

          metrics.append("text")
            .attr("class", "node-metric-value")
            .attr("x", nodeWidth / 2 - 50)
            .attr("y", 20)
            .text(d => `$${formatNumber(d.data.spend)}`)
        })

        // Add collapse buttons
        nodes.filter(d => d.children || d._children)
          .append("g")
          .attr("class", "collapse-button-container")
          .attr("transform", `translate(${nodeWidth / 2 - 25}, ${-nodeHeight / 2 + 15})`)
          .style("pointer-events", "all") // Ensure collapse button is clickable
          .append("text")
          .attr("class", "collapse-button")
          .text("▼")
          .on("click", (event, d) => {
            event.stopPropagation()
            toggleNode(d)
          })

        links.lower()
        nodes.raise()

        links.attr("d", diagonal)

        nodes.attr("transform", d => `translate(${d.x},${d.y})`)
      }

      // Setup gradients
      const defs = svg.append("defs")
      defs.append("linearGradient")
        .attr("id", "headerGradient")
        .attr("x1", "0%")
        .attr("y1", "0%")
        .attr("x2", "100%")
        .attr("y2", "100%")
        .selectAll("stop")
        .data([
          { offset: "0%", color: "#232f3e" },
          { offset: "100%", color: "#37475A" }
        ])
        .enter().append("stop")
        .attr("offset", d => d.offset)
        .attr("stop-color", d => d.color)

      update(root)
      
      // Auto-fit the chart to container AFTER rendering
      setTimeout(() => {
        fitChartToContainer()
      }, 100)
    }, 0)
  }

  function collapseNode(d: any) {
    if (d.children) {
      d.children.forEach(collapseNode)
      d._children = d.children
      d.children = null
    }
  }

  function toggleNode(d: any) {
    toggleNodeWithNeighborCollapse(d)
  }

  function toggleNodeWithNeighborCollapse(d: any) {
    console.log('Toggling node:', d.data.name, 'type:', d.data.type, 'has children:', !!d.children, 'has _children:', !!d._children)
    
    if (d.children) {
      // Collapsing - just collapse this node
      collapseNode(d)
    } else if (d._children) {
      // Expanding - collapse all neighbors first
      if (d.parent && d.parent.children) {
        d.parent.children.forEach(sibling => {
          if (sibling !== d && (sibling.children || sibling._children)) {
            // Collapse all siblings
            if (sibling.children) {
              sibling._children = sibling.children
              sibling.children = null
            }
          }
        })
      }
      
      // Also collapse cousins (parent's siblings' children)
      if (d.parent && d.parent.parent && d.parent.parent.children) {
        d.parent.parent.children.forEach(uncle => {
          if (uncle !== d.parent && uncle.children) {
            uncle.children.forEach(cousin => {
              if (cousin.children) {
                cousin._children = cousin.children
                cousin.children = null
              }
            })
          }
        })
      }
      
      // Now expand ONLY immediate children (not all descendants)
      d.children = d._children
      d._children = null
      
      // CRITICAL: Ensure grandchildren remain collapsed
      if (d.children) {
        d.children.forEach(child => {
          if (child.children) {
            console.log('Keeping grandchild collapsed:', child.data.name)
            child._children = child.children
            child.children = null
          }
        })
      }
    }
    
    update(root)
    
    // Call the callback to reapply filters after the DOM has been updated
    if (onNodeToggleCallback) {
      setTimeout(() => {
        onNodeToggleCallback!()
      }, 50) // Small delay to ensure DOM is updated
    }
  }

  function diagonal(d: any) {
    const source = d.source
    const target = d.target

    // Check if target is part of a grid layout
    const isGridLayout = source.data.type === 'department' && 
      source.children && 
      source.children.length > 8 &&
      target.data.type === 'account'

    if (isGridLayout) {
      // Use straight lines for grid layout
      return `M ${source.x} ${source.y}
              L ${target.x} ${target.y}`
    } else {
      // Use curved lines for tree layout
      return d3.linkVertical()
        .x((d: any) => d.x)
        .y((d: any) => d.y)
        .source(() => ({ x: source.x, y: source.y }))
        .target(() => ({ x: target.x, y: target.y }))()
    }
  }

  function arrangeAccountNodes(nodes: d3.HierarchyNode<any>[]) {
    // Track Y positions to avoid overlaps
    const usedYLevels = new Set<number>()
    
    // Find the master node and arrange its LOBs in a grid
    const masterNode = nodes.find(d => d.data.type === 'master')
    if (masterNode && masterNode.children && masterNode.children.length > 0) {
      console.log(`arranging ${masterNode.children.length} LOBs in grid layout`)
      const totalChildren = masterNode.children.length
      const MAX_COLUMNS = 4
      const COLUMNS = Math.min(MAX_COLUMNS, totalChildren)
      const ROWS = Math.ceil(totalChildren / COLUMNS)
      
      const SPACING_X = nodeWidth * 1.1
      const SPACING_Y = nodeHeight * 1.4
      
      const totalWidth = COLUMNS * SPACING_X
      const gridStartX = masterNode.x - (totalWidth / 2) + (SPACING_X / 2)
      const gridStartY = masterNode.y + nodeHeight * 1.8

      masterNode.children.forEach((lob, i) => {
        const row = Math.floor(i / COLUMNS)
        const col = i % COLUMNS
        
        const nodesInThisRow = (row === ROWS - 1) ? totalChildren - (row * COLUMNS) : COLUMNS
        const rowOffset = (COLUMNS - nodesInThisRow) * SPACING_X / 2
        
        lob.x = gridStartX + (col * SPACING_X) + rowOffset
        lob.y = gridStartY + (row * SPACING_Y)
        
        // Track LOB Y positions to avoid child overlap
        usedYLevels.add(lob.y)
        usedYLevels.add(lob.y + nodeHeight)
        usedYLevels.add(lob.y - nodeHeight)
      })
    }
    
    // Handle expanded LOB and department nodes with collision avoidance
    nodes.forEach(d => {
      if ((d.data.type === 'lob' || d.data.type === 'department') && d.children && d.children.length > 0) {
        console.log(`arranging ${d.children.length} ${d.data.type} children in grid`)
        const totalChildren = d.children.length
        const MAX_COLUMNS = 4
        const COLUMNS = Math.min(MAX_COLUMNS, totalChildren)
        const ROWS = Math.ceil(totalChildren / COLUMNS)
        
        const SPACING_X = nodeWidth * 1.1
        const SPACING_Y = nodeHeight * 1.3
        
        const totalWidth = COLUMNS * SPACING_X
        const gridStartX = d.x - (totalWidth / 2) + (SPACING_X / 2)
        
        // Calculate safe Y position based on node type
        let proposedStartY = d.y + nodeHeight * 1.8
        
        // For LOB children (departments), ensure they don't overlap with other LOB rows
        if (d.data.type === 'lob') {
          // Find the maximum Y coordinate of all LOB nodes to place departments below all LOBs
          const allLobNodes = nodes.filter(n => n.data.type === 'lob')
          if (allLobNodes.length > 0) {
            const maxLobY = Math.max(...allLobNodes.map(lob => lob.y || 0))
            proposedStartY = Math.max(proposedStartY, maxLobY + nodeHeight * 2.0)
          }
        }
        
        // For department children (accounts), place them even further below
        if (d.data.type === 'department') {
          // Find max Y of all department nodes to place accounts below all departments
          const allDeptNodes = nodes.filter(n => n.data.type === 'department')
          if (allDeptNodes.length > 0) {
            const maxDeptY = Math.max(...allDeptNodes.map(dept => dept.y || 0))
            proposedStartY = Math.max(proposedStartY, maxDeptY + nodeHeight * 2.0)
          }
        }

        d.children.forEach((child, i) => {
          const row = Math.floor(i / COLUMNS)
          const col = i % COLUMNS
          
          const nodesInThisRow = (row === ROWS - 1) ? totalChildren - (row * COLUMNS) : COLUMNS
          const rowOffset = (COLUMNS - nodesInThisRow) * SPACING_X / 2
          
          child.x = gridStartX + (col * SPACING_X) + rowOffset
          child.y = proposedStartY + (row * SPACING_Y)
          
          // Track child positions to prevent future overlaps
          usedYLevels.add(child.y)
        })
      }
    })
  }

  function update(source: any) {
    if (!tree || !root) return
    
    // First let d3 do the basic tree layout
    tree(source)

    // Get all nodes
    const descendants = source.descendants()
    
    // Then apply our custom grid arrangements ONLY for expanded nodes
    arrangeAccountNodes(descendants)

    // Update links AFTER positioning
    const links = g.selectAll(".link")
      .data(source.links())
      .join("path")
      .attr("class", "link")
      .attr("d", diagonal)

    // Update nodes with new positions
    const nodes = g.selectAll(".node")
      .data(descendants)
      .join("g")
      .attr("class", d => `node ${d.data.type} ${d._children ? 'collapsed' : ''}`)

    // Clear existing content and redraw
    nodes.selectAll("*").remove()
    addNodeContent(nodes)

    // Position everything with transitions
    nodes.transition()
      .duration(500)
      .attr("transform", d => `translate(${d.x},${d.y})`)

    links.transition()
      .duration(500)  
      .attr("d", diagonal)

    links.lower()
    nodes.raise()
  }

  function addNodeContent(nodes: any) {
    // Add styled node boxes with proper interactions
    nodes.append("rect")
      .attr("class", d => `node-box ${d.data.type}`)
      .attr("x", -nodeWidth / 2)
      .attr("y", -nodeHeight / 2)
      .attr("width", nodeWidth)
      .attr("height", nodeHeight)
      .attr("rx", 8)
      .attr("ry", 8)
      .style("fill", d => getNodeBackgroundColor(d.data))
      .style("stroke", d => getNodeStrokeColor(d.data))
      .style("stroke-width", 2)
      .style("filter", "drop-shadow(0 4px 6px rgba(0, 0, 0, 0.3))")
      .style("cursor", "pointer")
      .style("transition", "all 0.2s ease")
      .on("click", function(event, d) {
        event.stopPropagation()
        console.log('Node clicked immediately:', d.data.name)
        
        // Immediate visual feedback
        d3.selectAll(".node-box")
          .style("stroke", getNodeStrokeColor)
          .style("stroke-width", 2)
          .style("filter", null)
        
        d3.select(this)
          .style("stroke", "#3b82f6")
          .style("stroke-width", 3)
          .style("filter", "brightness(1.2)")
        
        // Set selected node immediately
        selectedNodeId.value = d.data.id
        
        // Toggle if has children (with neighbor collapse)
        if (d.children || d._children) {
          toggleNodeWithNeighborCollapse(d)
          
          // Center after expansion with longer delay for animation to complete
          setTimeout(() => {
            // Re-fetch the node after update to get correct children positions
            const updatedNode = d3.selectAll('.node').filter((n: any) => n.data.id === d.data.id).datum()
            centerOnNode(updatedNode || d)
          }, 550)
        } else {
          // For leaf nodes, just center immediately
          centerOnNode(d)
        }
      })
      .on("mouseenter", function(event, d) {
        d3.select(this)
          .transition()
          .duration(100)
          .style("filter", "brightness(1.1) drop-shadow(0 6px 12px rgba(0,0,0,0.4))")
          .style("transform", "scale(1.02)")
      })
      .on("mouseleave", function(event, d) {
        if (d.data.id !== selectedNodeId.value) {
          d3.select(this)
            .transition()
            .duration(100)
            .style("filter", "drop-shadow(0 4px 6px rgba(0, 0, 0, 0.3))")
            .style("transform", null)
        }
      })

    // Add node content
    nodes.append("g")
      .attr("class", "node-content")
      .attr("transform", `translate(${-nodeWidth / 2 + 15}, ${-nodeHeight / 2 + 15})`)
      .style("pointer-events", "none") // Ensure text doesn't block clicks

    // Add node details
    nodes.each(function(d) {
      const nodeContent = d3.select(this).select(".node-content")

      // Add header text with better styling
      nodeContent.append("text")
        .attr("class", "node-header")
        .attr("y", 20)
        .attr("x", 10)
        .style("fill", "#ffffff")
        .style("font-weight", "600")
        .style("font-size", "14px")
        .text(d => {
          // Truncate long names
          return d.data.name.length > 30 ? d.data.name.substring(0, 27) + '...' : d.data.name
        })

      // Add subheader (ID) with better visibility
      nodeContent.append("text")
        .attr("class", "node-subheader")
        .attr("y", 40)
        .attr("x", 10)
        .style("fill", "#d1d5db")
        .style("font-size", "10px")
        .text(d => d.data.id)

      // Add utilization circle
      const progressGroup = nodeContent.append("g")
        .attr("transform", `translate(${nodeWidth - 70}, 65)`)

      progressGroup.append("circle")
        .attr("class", "node-progress-container")
        .attr("r", 30)
        .attr("cx", 0)
        .attr("cy", 0)

      const progress = d.data.spend / d.data.budget
      const arc = d3.arc()
        .innerRadius(26)
        .outerRadius(34)
        .startAngle(0)
        .endAngle(Math.PI * 2 * progress)

      progressGroup.append("path")
        .attr("d", arc)
        .attr("fill", getUtilizationColor(d.data))

      progressGroup.append("text")
        .attr("class", "node-utilization")
        .attr("text-anchor", "middle")
        .attr("dy", "0.35em")
        .attr("fill", getUtilizationColor(d.data))
        .text(`${(progress * 100).toFixed(0)}%`)

      // Add metrics
      const metrics = nodeContent.append("g")
        .attr("transform", "translate(10, 60)")

      metrics.append("text")
        .attr("class", "node-metric")
        .text("Budget")

      metrics.append("text")
        .attr("class", "node-metric-value")
        .attr("y", 20)
        .text(d => `$${formatNumber(d.data.budget)}`)

      metrics.append("text")
        .attr("class", "node-metric")
        .attr("x", nodeWidth / 2 - 50)
        .text("Spend")

      metrics.append("text")
        .attr("class", "node-metric-value")
        .attr("x", nodeWidth / 2 - 50)
        .attr("y", 20)
        .text(d => `$${formatNumber(d.data.spend)}`)
    })

    // Add collapse buttons
    nodes.filter(d => d.children || d._children)
      .append("g")
      .attr("class", "collapse-button-container")
      .attr("transform", `translate(${nodeWidth / 2 - 25}, ${-nodeHeight / 2 + 15})`)
      .style("pointer-events", "all") // Ensure collapse button is clickable
      .append("text")
      .attr("class", "collapse-button")
      .text("▼")
      .on("click", (event, d) => {
        event.stopPropagation()
        toggleNode(d)
      })
  }

  function getUtilizationColor(data: TreeNode) {
    const utilization = (data.spend || 0) / (data.budget || 1)
    if (utilization > 1) return '#dc2626'
    if (utilization > 0.9) return '#f59e0b'
    if (utilization > 0.7) return '#eab308'
    return '#10b981'
  }

  function getNodeBackgroundColor(data: TreeNode) {
    switch (data.type) {
      case 'master': return '#1e293b'
      case 'lob': return '#1e1b4b'
      case 'department': return '#14532d'
      case 'account': return '#1f2937'
      default: return '#1f2937'
    }
  }

  function getNodeStrokeColor(data: TreeNode) {
    switch (data.type) {
      case 'master': return '#3b82f6'
      case 'lob': return '#f59e0b'
      case 'department': return '#10b981'
      case 'account': return '#6b7280'
      default: return '#6b7280'
    }
  }

  function formatNumber(num: number) {
    return new Intl.NumberFormat('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(num || 0)
  }

  function calculateTotals(node: TreeNode) {
    if (node.children) {
      node.spend = node.children.reduce((sum, child) => {
        calculateTotals(child)
        return sum + (child.spend || 0)
      }, 0)
    }
    return node
  }

  function zoomIn() {
    svg?.call(zoom.scaleBy, 1.2)
  }

  function zoomOut() {
    svg?.call(zoom.scaleBy, 0.8)
  }

  function resetZoom() {
    fitChartToContainer()
  }
  
  function fitChartToContainer() {
    if (!g || !svg) return
    
    try {
      // Get the bounding box of all nodes
      const bounds = g.node()?.getBBox()
      if (!bounds) return
      
      const container = document.querySelector('.visualization-container')
      if (!container) return
      
      const containerWidth = container.clientWidth
      const containerHeight = container.clientHeight
      
      // Calculate scale to fit content with padding
      const padding = 60
      const scaleX = (containerWidth - padding * 2) / bounds.width
      const scaleY = (containerHeight - padding * 2) / bounds.height
      const scale = Math.min(scaleX, scaleY, 1) // Don't scale up, only down
      
      // Calculate center position
      const centerX = containerWidth / 2
      const centerY = containerHeight / 2
      const boundsCenterX = bounds.x + bounds.width / 2
      const boundsCenterY = bounds.y + bounds.height / 2
      
      const transform = d3.zoomIdentity
        .translate(centerX - boundsCenterX * scale, centerY - boundsCenterY * scale)
        .scale(scale)
      
      svg.transition()
        .duration(750)
        .ease(d3.easeQuadInOut)
        .call(zoom.transform, transform)
        
    } catch (error) {
      console.warn('Failed to fit chart to container:', error)
      // Fallback to simple center
      const container = document.querySelector('.visualization-container')
      if (container) {
        const centerTransform = d3.zoomIdentity
          .translate(container.clientWidth / 2, container.clientHeight / 2)
          .scale(0.8)
        svg.transition().duration(750).call(zoom.transform, centerTransform)
      }
    }
  }

  function centerOnNode(d: any) {
    if (!svg || !d) return
    
    const container = document.querySelector('.visualization-container')
    if (!container) return
    
    const containerWidth = container.clientWidth
    const containerHeight = container.clientHeight
    
    // If node has children (or will have after expansion), focus on the children
    if (d.children || d._children) {
      const children = d.children || d._children || []
      
      if (children.length > 0) {
        // Calculate bounding box for ONLY the children, not the parent
        const xValues = children.map(n => n.x || d.x)
        const yValues = children.map(n => n.y || d.y)
        
        const minX = Math.min(...xValues)
        const maxX = Math.max(...xValues)
        const minY = Math.min(...yValues)
        const maxY = Math.max(...yValues)
        
        const childrenWidth = maxX - minX + nodeWidth
        const childrenHeight = maxY - minY + nodeHeight
        
        // Add padding and limit zoom to show ~4 nodes width
        const padding = 60
        const fourNodesWidth = nodeWidth * 4.5 // 4 nodes + spacing
        const maxScale = Math.max(0.8, containerWidth / fourNodesWidth) // Use same calculation as zoom setup
        
        const scaleX = (containerWidth - padding * 2) / childrenWidth
        const scaleY = (containerHeight - padding * 2) / childrenHeight
        const scale = Math.min(scaleX, scaleY, maxScale) // Respect the same limit as manual zoom
        
        // Center on the children, but skew towards top of canvas
        const childrenCenterX = (minX + maxX) / 2
        const childrenCenterY = (minY + maxY) / 2
        
        // Skew Y position towards top - show parent node at top, children below
        // Place children center at 40% from top instead of 50%
        const targetY = containerHeight * 0.4
        
        const transform = d3.zoomIdentity
          .translate(containerWidth / 2 - childrenCenterX * scale, targetY - childrenCenterY * scale)
          .scale(scale)
        
        svg.transition()
          .duration(750)
          .ease(d3.easeQuadInOut)
          .call(zoom.transform, transform)
        return
      }
    }
    
    // Fallback: for leaf nodes or nodes without children, center on the node itself
    // But still skew towards top
    const scale = 1.2
    const centerX = containerWidth / 2
    const targetY = containerHeight * 0.3 // Place node at 30% from top for leaf nodes
    
    const transform = d3.zoomIdentity
      .translate(centerX - d.x * scale, targetY - d.y * scale)
      .scale(scale)
    
    svg.transition()
      .duration(500)
      .ease(d3.easeQuadInOut)
      .call(zoom.transform, transform)
  }

  const cleanup = () => {
    const container = document.querySelector('.visualization-container')
    if (container && (container as any)._resizeObserver) {
      ;(container as any)._resizeObserver.disconnect()
      delete (container as any)._resizeObserver
    }
  }

  const setOnNodeToggleCallback = (callback: () => void) => {
    onNodeToggleCallback = callback
  }

  return {
    drawChart,
    calculateTotals,
    zoomIn,
    zoomOut,
    resetZoom,
    fitChartToContainer,
    centerOnNode,
    getUtilizationColor,
    getNodeBackgroundColor,
    getNodeStrokeColor,
    formatNumber,
    selectedNodeId,
    cleanup,
    setOnNodeToggleCallback
  }
} 