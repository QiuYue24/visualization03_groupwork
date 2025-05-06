const width = 960;
const height = 600;

// 画布
const svg = d3.select("#map")
  .append("svg")
  .attr("width", width)
  .attr("height", height);

// 投影
const projection = d3.geoMercator()
  .center([0, 20])
  .scale(150)
  .translate([width / 2, height / 2]);

const path = d3.geoPath().projection(projection);

// 加载世界地图
d3.json("https://raw.githubusercontent.com/holtzy/D3-graph-gallery/master/DATA/world.geojson").then(worldData => {
  svg.append("g")
    .selectAll("path")
    .data(worldData.features)
    .enter()
    .append("path")
    .attr("fill", "#e0e0e0")
    .attr("d", path)
    .style("stroke", "#999");

  // 加载公司数据
  // 聚合连接路径
  d3.csv("possessed_data/us_com_city.csv").then(data => {
    // 子公司城市聚合
    const cityAgg = d3.rollups(
      data,
      v => ({
        count: v.length,
        lat: +v[0].sub_lat,
        lng: +v[0].sub_lng
      }),
      d => d.Subsidiary_City_clean
    );
  
    const bubbles = cityAgg.map(([city, v]) => ({
      city,
      count: v.count,
      lat: v.lat,
      lng: v.lng
    }));
  
    svg.selectAll("circle.bubble")
      .data(bubbles)
      .enter()
      .append("circle")
      .attr("cx", d => projection([d.lng, d.lat])[0])
      .attr("cy", d => projection([d.lng, d.lat])[1])
      .attr("r", d => Math.sqrt(d.count) + 2)
      .attr("fill", "#e91e63")
      .attr("opacity", 0.7)
      .append("title")
      .text(d => `${d.city}: ${d.count} companies`);
  });
  

});
